import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { SensorReading, ConnectionStatus, Settings, Alert } from '../../shared/types'
import { getAlertLevel } from '../utils/thresholds'
import { BrowserMqttClient } from '../mqtt-browser'

interface UseSensorDataResult {
  latest: SensorReading | null
  readings: SensorReading[]
  connectionStatus: ConnectionStatus
  alerts: Alert[]
  dismissAlert: (id: string) => void
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

function pm25ToAqi(pm25: number): number {
  const truncated = Math.floor(pm25 * 10) / 10
  const breakpoints = [
    { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
  ]
  for (const bp of breakpoints) {
    if (truncated >= bp.cLow && truncated <= bp.cHigh) {
      return Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (truncated - bp.cLow) + bp.iLow)
    }
  }
  return truncated > 500.4 ? 500 : 0
}

function parseReading(payload: string): SensorReading | null {
  try {
    if (payload.length > 4096) return null
    const data = JSON.parse(payload)
    if (typeof data.pm25 !== 'number' || typeof data.pm10 !== 'number') return null
    if (!Number.isFinite(data.pm25) || !Number.isFinite(data.pm10)) return null
    if (data.pm25 < 0 || data.pm25 > 1000 || data.pm10 < 0 || data.pm10 > 1000) return null

    const now = Date.now()
    const timestamp = (typeof data.timestamp === 'number' &&
      Number.isFinite(data.timestamp) &&
      Math.abs(data.timestamp - now) < 60_000) ? data.timestamp : now

    return {
      timestamp,
      pm25: data.pm25,
      pm10: data.pm10,
      temperature: typeof data.temperature === 'number' && Number.isFinite(data.temperature) ? data.temperature : 0,
      humidity: typeof data.humidity === 'number' && Number.isFinite(data.humidity) ? data.humidity : 0,
      aqi: pm25ToAqi(data.pm25)
    }
  } catch {
    return null
  }
}

export function useSensorData(
  settings: Settings | null
): UseSensorDataResult {
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const thresholdsRef = useRef<{ pm25: number; pm10: number }>({ pm25: 35, pm10: 150 })
  const mqttClientRef = useRef<BrowserMqttClient | null>(null)

  useEffect(() => {
    if (settings?.thresholds) {
      thresholdsRef.current = settings.thresholds
    }
  }, [settings?.thresholds])

  const processReading = useCallback((reading: SensorReading) => {
    setReadings((prev) => {
      const cutoff = Date.now() - TWENTY_FOUR_HOURS
      const filtered = prev.filter(r => r.timestamp >= cutoff)
      return [...filtered, reading]
    })
    window.api.persistReading(reading)

    const t = thresholdsRef.current
    const newAlerts: Alert[] = []
    if (reading.pm25 > t.pm25) {
      newAlerts.push({
        id: `pm25-${Date.now()}`,
        metric: 'PM2.5',
        value: reading.pm25,
        threshold: t.pm25,
        level: getAlertLevel('pm25', reading.pm25),
        timestamp: Date.now()
      })
    }
    if (reading.pm10 > t.pm10) {
      newAlerts.push({
        id: `pm10-${Date.now()}`,
        metric: 'PM10',
        value: reading.pm10,
        threshold: t.pm10,
        level: getAlertLevel('pm10', reading.pm10),
        timestamp: Date.now()
      })
    }
    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 10))
    }
  }, [])

  // Browser WebSocket MQTT connection (bypasses macOS local network block)
  useEffect(() => {
    if (!settings || settings.useMockData) return

    const client = new BrowserMqttClient()
    mqttClientRef.current = client

    client.onStatusChange((status) => {
      setConnectionStatus(status)
    })

    client.onData((_topic, payload) => {
      const reading = parseReading(payload)
      if (reading) processReading(reading)
    })

    client.connect(settings.brokerUrl, settings.topic)

    return () => {
      mqttClientRef.current = null
      client.disconnect()
    }
  }, [settings?.brokerUrl, settings?.topic, settings?.useMockData, processReading])

  // Load history and sync Pi database on mount
  useEffect(() => {
    const since = Date.now() - TWENTY_FOUR_HOURS
    window.api.getHistory(since).then((history) => {
      setReadings(prev => {
        const historyTs = new Set(history.map(r => r.timestamp))
        const liveOnly = prev.filter(r => !historyTs.has(r.timestamp))
        return [...history, ...liveOnly].sort((a, b) => a.timestamp - b.timestamp)
      })
    }).catch((err) => {
      console.error('Failed to load history:', err)
    })

    // Sync Pi database (main process downloads via Chromium's net.fetch)
    if (settings?.piDatabaseUrl) {
      window.api.syncPiDb(settings.piDatabaseUrl)
        .then(() => {
          const cutoff = Date.now() - TWENTY_FOUR_HOURS
          return window.api.getHistory(cutoff)
        })
        .then((history) => {
          setReadings(prev => {
            const historyTs = new Set(history.map(r => r.timestamp))
            const liveOnly = prev.filter(r => !historyTs.has(r.timestamp))
            return [...history, ...liveOnly].sort((a, b) => a.timestamp - b.timestamp)
          })
        })
        .catch((err) => {
          console.error('Pi database sync failed (continuing with local data):', err)
        })
    }

    const removeSensorData = window.api.onSensorData((reading: SensorReading) => {
      processReading(reading)
    })

    const removeStatus = window.api.onConnectionStatus((status: ConnectionStatus) => {
      setConnectionStatus(status)
    })

    const removeHistoryUpdated = window.api.onHistoryUpdated(() => {
      const cutoff = Date.now() - TWENTY_FOUR_HOURS
      window.api.getHistory(cutoff).then((history) => {
        setReadings(history)
      }).catch((err) => {
        console.error('Failed to reload history after sync:', err)
      })
    })

    return () => {
      removeSensorData()
      removeStatus()
      removeHistoryUpdated()
    }
  }, [processReading, settings?.piDatabaseUrl])

  // Publish MQTT commands when continuous mode toggles
  useEffect(() => {
    const remove = window.api.onContinuousMode((enabled) => {
      const client = mqttClientRef.current
      if (client && settings && !settings.useMockData) {
        const commandTopic = settings.topic.replace(/\/data$/, '/command')
        client.publish(commandTopic, JSON.stringify({
          command: 'set_continuous',
          enabled
        }))
      }
    })
    return remove
  }, [settings])

  useEffect(() => {
    if (alerts.length === 0) return
    const timer = setTimeout(() => {
      const cutoff = Date.now() - 30000
      setAlerts((prev) => prev.filter(a => a.timestamp > cutoff))
    }, 30000)
    return () => clearTimeout(timer)
  }, [alerts])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter(a => a.id !== id))
  }, [])

  const latest = useMemo(
    () => readings.length > 0 ? readings[readings.length - 1] : null,
    [readings]
  )

  return { latest, readings, connectionStatus, alerts, dismissAlert }
}
