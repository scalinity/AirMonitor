import { app } from 'electron'
import { join } from 'path'
import { writeFile, unlink, mkdtemp, rmdir } from 'fs/promises'
import Database from 'better-sqlite3'
import { SensorReading } from '../shared/types'

/**
 * Parse a downloaded Pi SQLite database buffer into sensor readings.
 * The download itself is done by the renderer (browser fetch) to bypass
 * macOS local network restrictions on Node.js HTTP.
 */
export async function parsePiDatabase(dbData: ArrayBuffer): Promise<SensorReading[]> {
  const tempDir = await mkdtemp(join(app.getPath('temp'), 'airmonitor-'))
  const dbPath = join(tempDir, 'pi.db')
  await writeFile(dbPath, Buffer.from(dbData), { mode: 0o600 })

  let db: InstanceType<typeof Database> | null = null
  try {
    db = new Database(dbPath, { readonly: true })

    // Only import last 30 days — matches data-store.ts retention window
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

    try {
      return db
        .prepare(
          'SELECT timestamp, pm25, pm10, aqi, COALESCE(temperature, 0) as temperature, COALESCE(humidity, 0) as humidity FROM readings WHERE timestamp >= ? ORDER BY timestamp ASC'
        )
        .all(thirtyDaysAgo) as SensorReading[]
    } catch (err) {
      // Only fall back for missing columns; rethrow other errors
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('no such column')) throw err

      // Fallback for databases without temperature/humidity columns
      const legacyRows = db
        .prepare(
          'SELECT timestamp, pm25, pm10, aqi FROM readings WHERE timestamp >= ? ORDER BY timestamp ASC'
        )
        .all(thirtyDaysAgo) as { timestamp: number; pm25: number; pm10: number; aqi: number }[]

      return legacyRows.map((row) => ({
        ...row,
        temperature: 0,
        humidity: 0
      }))
    }
  } finally {
    if (db) db.close()
    unlink(dbPath).catch(() => {})
    rmdir(tempDir).catch(() => {})
  }
}
