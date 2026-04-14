import { app } from 'electron'
import { join } from 'path'
import { SensorReading, Settings, DEFAULT_SETTINGS } from '../shared/types'

interface StoreData {
  readings: SensorReading[]
  settings: Settings
}

let db: { data: StoreData; write: () => Promise<void> } | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let writePending = false

export async function initStore(): Promise<void> {
  const { Low } = await import('lowdb')
  const { JSONFile } = await import('lowdb/node')
  const filePath = join(app.getPath('userData'), 'airmonitor-data.json')
  const defaultData: StoreData = { readings: [], settings: { ...DEFAULT_SETTINGS } }
  const adapter = new JSONFile<StoreData>(filePath)
  const instance = new Low<StoreData>(adapter, defaultData)
  try {
    await instance.read()
    // Backfill new default fields into existing settings
    instance.data.settings = { ...DEFAULT_SETTINGS, ...instance.data.settings }
  } catch {
    instance.data = defaultData
    await instance.write()
  }
  db = instance
}

function getDb() {
  if (!db) throw new Error('Store not initialized. Call initStore() first.')
  return db
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
const WRITE_DEBOUNCE_MS = 5000

function scheduleWrite(): void {
  writePending = true
  if (writeTimer) return
  writeTimer = setTimeout(async () => {
    writeTimer = null
    if (!writePending) return
    writePending = false
    try {
      const store = getDb()
      await store.write()
    } catch (err) {
      console.error('Failed to write store:', err)
    }
  }, WRITE_DEBOUNCE_MS)
}

export async function addReading(reading: SensorReading): Promise<void> {
  const store = getDb()
  store.data.readings.push(reading)
  const cutoff = Date.now() - THIRTY_DAYS
  store.data.readings = store.data.readings.filter(r => r.timestamp >= cutoff)
  scheduleWrite()
}

export function getReadings(since: number): SensorReading[] {
  const store = getDb()
  return store.data.readings.filter(r => r.timestamp >= since)
}

export async function importReadings(piReadings: SensorReading[]): Promise<void> {
  const store = getDb()
  const piTimestamps = new Set(piReadings.map(r => r.timestamp))
  const localOnly = store.data.readings.filter(r => !piTimestamps.has(r.timestamp))
  store.data.readings = [...piReadings, ...localOnly].sort((a, b) => a.timestamp - b.timestamp)
  const cutoff = Date.now() - THIRTY_DAYS
  store.data.readings = store.data.readings.filter(r => r.timestamp >= cutoff)
  await store.write()
}

export function getSettings(): Settings {
  const store = getDb()
  return { ...store.data.settings }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const store = getDb()
  store.data.settings = { ...settings }
  await store.write()
}
