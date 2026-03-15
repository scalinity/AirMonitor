export interface SensorReading {
  timestamp: number
  pm25: number
  pm10: number
  temperature: number
  humidity: number
  aqi: number
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

export type AlertLevel = 'good' | 'moderate' | 'unhealthy_sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous'

export interface Settings {
  brokerUrl: string
  topic: string
  refreshInterval: number
  useMockData: boolean
  thresholds: {
    pm25: number
    pm10: number
  }
}

export interface Alert {
  id: string
  metric: string
  value: number
  threshold: number
  level: AlertLevel
  timestamp: number
}

export interface ElectronAPI {
  getHistory: (since: number) => Promise<SensorReading[]>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<void>
  setContinuous: (enabled: boolean) => Promise<void>
  onSensorData: (callback: (reading: SensorReading) => void) => () => void
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => () => void
  onContinuousMode: (callback: (enabled: boolean) => void) => () => void
}

export const DEFAULT_SETTINGS: Settings = {
  brokerUrl: 'mqtt://raspberrypi.local:1883',
  topic: 'airmonitor/data',
  refreshInterval: 5,
  useMockData: true,
  thresholds: {
    pm25: 35,
    pm10: 150
  }
}
