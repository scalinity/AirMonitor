import { app } from 'electron'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import http from 'http'
import https from 'https'
import Database from 'better-sqlite3'
import { SensorReading } from '../shared/types'

interface PiReadingRow {
  timestamp: number
  pm25: number
  pm10: number
  aqi: number
}

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

function validateUrl(url: string): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol} (only http/https allowed)`)
  }
  return parsed
}

function downloadFile(url: string): Promise<Buffer> {
  const parsed = validateUrl(url)
  const httpModule = parsed.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = httpModule.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading Pi database`))
        res.resume()
        return
      }

      let totalBytes = 0
      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_DOWNLOAD_BYTES) {
          req.destroy()
          reject(new Error(`Download exceeded ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB limit`))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Download timed out'))
    })
  })
}

export async function syncPiDatabase(piDbUrl: string): Promise<SensorReading[]> {
  validateUrl(piDbUrl)
  const dbBuffer = await downloadFile(piDbUrl)
  const dbPath = join(app.getPath('temp'), 'airmonitor-pi.db')
  await writeFile(dbPath, dbBuffer)

  const db = new Database(dbPath, { readonly: true })

  try {
    const rows: PiReadingRow[] = db
      .prepare('SELECT timestamp, pm25, pm10, aqi FROM readings ORDER BY timestamp ASC')
      .all() as PiReadingRow[]

    return rows.map((row) => ({
      timestamp: row.timestamp,
      pm25: row.pm25,
      pm10: row.pm10,
      temperature: 0,
      humidity: 0,
      aqi: row.aqi
    }))
  } finally {
    db.close()
    unlink(dbPath).catch(() => {})
  }
}
