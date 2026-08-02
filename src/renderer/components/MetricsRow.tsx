import React, { useMemo } from 'react'
import MetricCard from './MetricCard'
import { SensorReading, AlertLevel } from '../../shared/types'
import { getAlertLevel } from '../utils/thresholds'

interface MetricsRowProps {
  reading: SensorReading | null
  readings: SensorReading[]
}

const SPARK_WINDOW_MS = 3 * 60 * 60 * 1000
const SPARK_MAX_POINTS = 40

// Same hues as the chart series — the card sparkline and the chart line are the same entity
const STROKES = {
  pm25: '#00d4aa',
  pm10: '#4b9fff',
  temperature: '#ff8c42',
  humidity: '#7c5cfc'
}

function toFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 * 10 + 320) / 10
}

function computeDelta(
  readings: SensorReading[],
  key: 'pm25' | 'pm10' | 'temperature' | 'humidity'
): { value: number; spanMin: number } | null {
  if (readings.length < 2) return null
  const tenMinAgo = Date.now() - 10 * 60 * 1000
  const past = readings.findLast(r => r.timestamp <= tenMinAgo) || readings[0]
  const latest = readings[readings.length - 1]
  const spanMin = Math.round((latest.timestamp - past.timestamp) / 60000)
  // Under 2 minutes of separation a delta is mostly sensor noise
  if (spanMin < 2) return null
  let value = latest[key] - past[key]
  if (key === 'temperature') value = value * 9 / 5
  return { value, spanMin }
}

export default function MetricsRow({ reading, readings }: MetricsRowProps) {
  const pm25Level = reading ? getAlertLevel('pm25', reading.pm25) : 'good' as AlertLevel
  const pm10Level = reading ? getAlertLevel('pm10', reading.pm10) : 'good' as AlertLevel

  // Most recent reading where the DHT11 actually returned data — bad reads
  // come through as temperature=0 AND humidity=0. PM cards always use the
  // freshest sample; env cards skip back to the last valid one so users don't
  // see "32 °F / 0 %" between bad cycles.
  const latestEnv = useMemo(() => {
    for (let i = readings.length - 1; i >= 0; i--) {
      const r = readings[i]
      if (r.temperature !== 0 || r.humidity !== 0) return r
    }
    return null
  }, [readings])

  const sparks = useMemo(() => {
    const cutoff = Date.now() - SPARK_WINDOW_MS
    const recent = readings.filter(r => r.timestamp >= cutoff)
    const stride = Math.max(1, Math.ceil(recent.length / SPARK_MAX_POINTS))
    const sampled = recent.filter((_, i) => i % stride === 0)
    const env = sampled.filter(r => !(r.temperature === 0 && r.humidity === 0))
    return {
      pm25: sampled.map(r => r.pm25),
      pm10: sampled.map(r => r.pm10),
      temperature: env.map(r => toFahrenheit(r.temperature)),
      humidity: env.map(r => r.humidity)
    }
  }, [readings])

  return (
    <div className="metrics-row">
      <MetricCard
        label="PM2.5"
        value={reading?.pm25 ?? null}
        unit={'µg/m³'}
        level={pm25Level}
        delta={computeDelta(readings, 'pm25')}
        spark={{ points: sparks.pm25, stroke: STROKES.pm25 }}
        index={0}
        secondary={reading?.pm25_old != null ? { label: 'old', value: reading.pm25_old } : null}
      />
      <MetricCard
        label="PM10"
        value={reading?.pm10 ?? null}
        unit={'µg/m³'}
        level={pm10Level}
        delta={computeDelta(readings, 'pm10')}
        spark={{ points: sparks.pm10, stroke: STROKES.pm10 }}
        index={1}
        secondary={reading?.pm10_old != null ? { label: 'old', value: reading.pm10_old } : null}
      />
      <MetricCard
        label="Temperature"
        value={latestEnv ? toFahrenheit(latestEnv.temperature) : null}
        unit={'°F'}
        level="good"
        delta={computeDelta(readings, 'temperature')}
        spark={{ points: sparks.temperature, stroke: STROKES.temperature }}
        index={2}
      />
      <MetricCard
        label="Humidity"
        value={latestEnv ? latestEnv.humidity : null}
        unit="%"
        level="good"
        delta={computeDelta(readings, 'humidity')}
        spark={{ points: sparks.humidity, stroke: STROKES.humidity }}
        index={3}
      />
    </div>
  )
}
