import React from 'react'
import MetricCard from './MetricCard'
import { SensorReading, AlertLevel } from '../../shared/types'
import { getAlertLevel } from '../utils/thresholds'

interface MetricsRowProps {
  reading: SensorReading | null
  readings: SensorReading[]
}

function computeTrend(readings: SensorReading[], key: keyof SensorReading): 'up' | 'down' | 'stable' {
  if (readings.length < 2) return 'stable'
  const tenMinAgo = Date.now() - 10 * 60 * 1000
  const pastReading = readings.findLast(r => r.timestamp <= tenMinAgo) || readings[0]
  const latest = readings[readings.length - 1]
  const diff = (latest[key] as number) - (pastReading[key] as number)
  if (Math.abs(diff) < 0.5) return 'stable'
  return diff > 0 ? 'up' : 'down'
}

export default function MetricsRow({ reading, readings }: MetricsRowProps) {
  const pm25Level = reading ? getAlertLevel('pm25', reading.pm25) : 'good' as AlertLevel
  const pm10Level = reading ? getAlertLevel('pm10', reading.pm10) : 'good' as AlertLevel
  const aqiLevel = reading ? getAlertLevel('aqi', reading.aqi) : 'good' as AlertLevel

  return (
    <div className="metrics-row">
      <MetricCard
        label="PM2.5"
        value={reading?.pm25 ?? null}
        unit={'\u00b5g/m\u00b3'}
        level={pm25Level}
        trend={computeTrend(readings, 'pm25')}
        index={0}
      />
      <MetricCard
        label="PM10"
        value={reading?.pm10 ?? null}
        unit={'\u00b5g/m\u00b3'}
        level={pm10Level}
        trend={computeTrend(readings, 'pm10')}
        index={1}
      />
      <MetricCard
        label="AQI"
        value={reading?.aqi ?? null}
        unit=""
        level={aqiLevel}
        trend={computeTrend(readings, 'aqi')}
        index={2}
      />
      <MetricCard
        label="Temperature"
        value={reading?.temperature ?? null}
        unit={'\u00b0C'}
        level="good"
        trend={computeTrend(readings, 'temperature')}
        index={3}
      />
      <MetricCard
        label="Humidity"
        value={reading?.humidity ?? null}
        unit="%"
        level="good"
        trend={computeTrend(readings, 'humidity')}
        index={4}
      />
    </div>
  )
}
