export interface SensorReading {
  timestamp: number
  pm25: number
  pm10: number
  temperature: number
  humidity: number
  aqi: number
  // A/B comparison: second (old) SDS011 read at the same moment; absent when not connected
  pm25_old?: number
  pm10_old?: number
}

export interface MqttCredentials {
  username: string
  password: string
}

export type ConnectionStatus ='connected' | 'disconnected' | 'reconnecting'

export type AlertLevel = 'good' | 'moderate' | 'unhealthy_sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous'

export interface Settings {
  brokerUrl: string
  topic: string
  refreshInterval: number
  useMockData: boolean
  piDatabaseUrl: string
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
  persistReading: (reading: SensorReading) => Promise<void>
  syncPiDb: (url: string) => Promise<number>
  getMqttCredentials: () => Promise<MqttCredentials | null>
  onSensorData: (callback: (reading: SensorReading) => void) => () => void
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => () => void
  onContinuousMode: (callback: (enabled: boolean) => void) => () => void
  onHistoryUpdated: (callback: () => void) => () => void
}

export const DEFAULT_SETTINGS: Settings = {
  brokerUrl: 'ws://pi.local:9001',
  topic: 'airmonitor/data',
  refreshInterval: 5,
  useMockData: true,
  piDatabaseUrl: 'http://pi.local:8080/airmonitor.db',
  thresholds: {
    pm25: 35,
    pm10: 150
  }
}
