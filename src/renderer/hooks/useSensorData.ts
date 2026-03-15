import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { SensorReading, ConnectionStatus, Alert } from '../../shared/types'
import { getAlertLevel } from '../utils/thresholds'

interface UseSensorDataResult {
  latest: SensorReading | null
  readings: SensorReading[]
  connectionStatus: ConnectionStatus
  alerts: Alert[]
  dismissAlert: (id: string) => void
}

export function useSensorData(
  thresholds?: { pm25: number; pm10: number }
): UseSensorDataResult {
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const thresholdsRef = useRef<{ pm25: number; pm10: number }>({ pm25: 35, pm10: 150 })

  // Keep thresholdsRef in sync with prop
  useEffect(() => {
    if (thresholds) {
      thresholdsRef.current = thresholds
    }
  }, [thresholds])

  useEffect(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000
    window.api.getHistory(since).then((history) => {
      setReadings(history)
    }).catch((err) => {
      console.error('Failed to load history:', err)
    })

    const removeSensorData = window.api.onSensorData((reading: SensorReading) => {
      setReadings((prev) => {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000
        const filtered = prev.filter(r => r.timestamp >= cutoff)
        return [...filtered, reading]
      })

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
    })

    const removeStatus = window.api.onConnectionStatus((status: ConnectionStatus) => {
      setConnectionStatus(status)
    })

    return () => {
      removeSensorData()
      removeStatus()
    }
  }, [])

  // Auto-dismiss alerts after 30s
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
