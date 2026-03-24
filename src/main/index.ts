import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initStore, addReading, getReadings, getSettings, saveSettings, importReadings } from './data-store'
import { generateMockReading } from './mock-data'
import { MqttSensorClient } from './mqtt-client'
import { SensorReading, Settings, ConnectionStatus } from '../shared/types'
import { syncPiDatabase } from './pi-sync'

let mainWindow: BrowserWindow | null = null
let mockInterval: ReturnType<typeof setInterval> | null = null
let isContinuous = false
let currentConnectionStatus: ConnectionStatus = 'disconnected'
const mqttClient = new MqttSensorClient()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  // Restrict navigation to prevent phishing/redirect attacks
  mainWindow.webContents.on('will-navigate', (event) => {
    if (!is.dev) {
      event.preventDefault()
    }
  })

  // Validate URLs before opening externally
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch {
      // invalid URL, silently deny
    }
    return { action: 'deny' }
  })

  // Set Content Security Policy (production only — dev needs inline scripts for Vite HMR)
  if (!is.dev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'"
          ]
        }
      })
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

function handleReading(reading: SensorReading): void {
  addReading(reading).catch((err) => {
    console.error('Failed to persist reading:', err)
  })
  sendToRenderer('sensor:data', reading)
}

function startMockData(intervalSeconds: number): void {
  stopMockData()
  sendToRenderer('sensor:status', 'connected' as ConnectionStatus)
  mockInterval = setInterval(() => {
    const reading = generateMockReading()
    handleReading(reading)
  }, intervalSeconds * 1000)
  handleReading(generateMockReading())
}

function stopMockData(): void {
  if (mockInterval) {
    clearInterval(mockInterval)
    mockInterval = null
  }
}

function connectMqtt(settings: Settings): void {
  mqttClient.disconnect()
  mqttClient.removeAllListeners()

  mqttClient.on('data', (reading: SensorReading) => {
    handleReading(reading)
  })

  mqttClient.on('status', (status: ConnectionStatus) => {
    currentConnectionStatus = status
    sendToRenderer('sensor:status', status)
  })

  mqttClient.connect(settings.brokerUrl, settings.topic)
}

async function startDataSource(): Promise<void> {
  const settings = getSettings()
  if (settings.useMockData) {
    startMockData(isContinuous ? 1 : settings.refreshInterval)
  } else {
    connectMqtt(settings)
  }
}

function validateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid settings: expected an object')
  }
  const s = raw as Record<string, unknown>

  if (typeof s.brokerUrl !== 'string') throw new Error('Invalid brokerUrl')
  // Validate broker URL protocol
  try {
    const url = new URL(s.brokerUrl)
    if (!['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('Invalid broker URL protocol')
    }
  } catch {
    throw new Error('Invalid broker URL format')
  }

  if (typeof s.topic !== 'string' || s.topic.length === 0 || s.topic.length > 256) {
    throw new Error('Invalid topic')
  }
  if (typeof s.refreshInterval !== 'number' || !Number.isFinite(s.refreshInterval) ||
      s.refreshInterval < 1 || s.refreshInterval > 3600) {
    throw new Error('Invalid refresh interval')
  }
  if (typeof s.useMockData !== 'boolean') throw new Error('Invalid useMockData')

  const piDatabaseUrl = typeof s.piDatabaseUrl === 'string' ? s.piDatabaseUrl : ''

  if (!s.thresholds || typeof s.thresholds !== 'object') throw new Error('Invalid thresholds')
  const t = s.thresholds as Record<string, unknown>
  if (typeof t.pm25 !== 'number' || !Number.isFinite(t.pm25) || t.pm25 < 0) {
    throw new Error('Invalid PM2.5 threshold')
  }
  if (typeof t.pm10 !== 'number' || !Number.isFinite(t.pm10) || t.pm10 < 0) {
    throw new Error('Invalid PM10 threshold')
  }

  return {
    brokerUrl: s.brokerUrl,
    topic: s.topic,
    refreshInterval: Math.round(s.refreshInterval),
    useMockData: s.useMockData,
    piDatabaseUrl,
    thresholds: { pm25: t.pm25, pm10: t.pm10 }
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('sensor:get-history', (_event, since: unknown) => {
    if (typeof since !== 'number' || !Number.isFinite(since)) {
      throw new Error('Invalid since parameter')
    }
    return getReadings(since)
  })

  ipcMain.handle('sensor:get-connection-status', () => {
    return currentConnectionStatus
  })

  ipcMain.handle('sensor:get-settings', () => {
    return getSettings()
  })

  ipcMain.handle('sensor:save-settings', async (_event, rawSettings: unknown) => {
    const oldSettings = getSettings()
    const settings = validateSettings(rawSettings)
    await saveSettings(settings)

    const connectionChanged = settings.brokerUrl !== oldSettings.brokerUrl ||
      settings.topic !== oldSettings.topic ||
      settings.useMockData !== oldSettings.useMockData

    if (settings.useMockData) {
      mqttClient.disconnect()
      startMockData(isContinuous ? 1 : settings.refreshInterval)
    } else if (connectionChanged) {
      stopMockData()
      mqttClient.disconnect()
      await startDataSource()
    } else {
      // Only interval/thresholds changed — send command without reconnecting
      const commandTopic = settings.topic.replace(/\/data$/, '/command')
      mqttClient.publish(commandTopic, JSON.stringify({
        command: 'set_interval',
        interval: settings.refreshInterval
      }))
    }
  })

  ipcMain.handle('sensor:set-continuous', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid continuous flag')
    isContinuous = enabled
    sendToRenderer('sensor:continuous', isContinuous)
    const settings = getSettings()
    if (settings.useMockData) {
      startMockData(isContinuous ? 1 : settings.refreshInterval)
    } else {
      // Send command to the Pi to toggle its continuous mode
      const commandTopic = settings.topic.replace(/\/data$/, '/command')
      mqttClient.publish(commandTopic, JSON.stringify({
        command: 'set_continuous',
        enabled: isContinuous
      }))
    }
  })
}

process.on('uncaughtException', (err) => {
  if (err.message?.includes('connack timeout') || err.message?.includes('ENOTFOUND')) {
    console.error('MQTT connection failed:', err.message)
    return
  }
  console.error('Uncaught exception:', err)
  app.quit()
})

app.whenReady().then(async () => {
  try {
    await initStore()
    registerIpcHandlers()
    createWindow()
    await startDataSource()

    const settings = getSettings()
    if (settings.piDatabaseUrl) {
      syncPiDatabase(settings.piDatabaseUrl)
        .then(async (piReadings) => {
          await importReadings(piReadings)
          console.log(`Imported ${piReadings.length} readings from Pi database`)
          sendToRenderer('sensor:history-updated', null)
        })
        .catch((err) => {
          console.error('Pi database sync failed (continuing with local data):', err)
        })
    }
  } catch (err) {
    console.error('Failed to initialize app:', err)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      startDataSource().catch((err) => {
        console.error('Failed to restart data source:', err)
      })
    }
  })
})

app.on('window-all-closed', () => {
  stopMockData()
  mqttClient.disconnect()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
