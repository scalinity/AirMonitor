import React, { useMemo } from 'react'
import MetricCard from './MetricCard'
import { SensorReading, AlertLevel } from '../../shared/types'
import { getAlertLevel } from '../utils/thresholds'
import { calibrateOld, combinedPm } from '../utils/calibration'

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

// Delta of the displayed value over ~10 minutes; accessor returns the value
// in display scale (combined PM, °F temperature)
function computeDelta(
  readings: SensorReading[],
  get: (r: SensorReading) => number
): { value: number; spanMin: number } | null {
  if (readings.length < 2) return null
  const tenMinAgo = Date.now() - 10 * 60 * 1000
  const past = readings.findLast(r => r.timestamp <= tenMinAgo) || readings[0]
  const latest = readings[readings.length - 1]
  const spanMin = Math.round((latest.timestamp - past.timestamp) / 60000)
  // Under 2 minutes of separation a delta is mostly sensor noise
  if (spanMin < 2) return null
  return { value: get(latest) - get(past), spanMin }
}

const getPm25 = (r: SensorReading) => combinedPm('pm25', r)
const getPm10 = (r: SensorReading) => combinedPm('pm10', r)
const getTempF = (r: SensorReading) => toFahrenheit(r.temperature)
const getHumidity = (r: SensorReading) => r.humidity

export default function MetricsRow({ reading, readings }: MetricsRowProps) {
  const pm25Value = reading ? getPm25(reading) : null
  const pm10Value = reading ? getPm10(reading) : null
  const pm25Level = pm25Value !== null ? getAlertLevel('pm25', pm25Value) : 'good' as AlertLevel
  const pm10Level = pm10Value !== null ? getAlertLevel('pm10', pm10Value) : 'good' as AlertLevel

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
      pm25: sampled.map(getPm25),
      pm10: sampled.map(getPm10),
      temperature: env.map(getTempF),
      humidity: env.map(getHumidity)
    }
  }, [readings])

  return (
    <div className="metrics-row">
      <MetricCard
        label="PM2.5"
        value={pm25Value}
        unit={'µg/m³'}
        level={pm25Level}
        delta={computeDelta(readings, getPm25)}
        spark={{ points: sparks.pm25, stroke: STROKES.pm25 }}
        index={0}
        secondary={reading?.pm25_old != null
          ? { label: 'old·cal', value: calibrateOld('pm25', reading.pm25_old), ref: reading.pm25 }
          : null}
      />
      <MetricCard
        label="PM10"
        value={pm10Value}
        unit={'µg/m³'}
        level={pm10Level}
        delta={computeDelta(readings, getPm10)}
        spark={{ points: sparks.pm10, stroke: STROKES.pm10 }}
        index={1}
        secondary={reading?.pm10_old != null
          ? { label: 'old·cal', value: calibrateOld('pm10', reading.pm10_old), ref: reading.pm10 }
          : null}
      />
      <MetricCard
        label="Temperature"
        value={latestEnv ? getTempF(latestEnv) : null}
        unit={'°F'}
        level="good"
        delta={computeDelta(readings, getTempF)}
        spark={{ points: sparks.temperature, stroke: STROKES.temperature }}
        index={2}
      />
      <MetricCard
        label="Humidity"
        value={latestEnv ? latestEnv.humidity : null}
        unit="%"
        level="good"
        delta={computeDelta(readings, getHumidity)}
        spark={{ points: sparks.humidity, stroke: STROKES.humidity }}
        index={3}
      />
    </div>
  )
}
