import React, { useMemo } from 'react'
import { SensorReading } from '../../shared/types'
import { aqiToLevel, aqiToLabel, LEVEL_COLORS, LEVEL_RGB, AQI_BANDS } from '../utils/aqi'
import { formatAge, startOfLocalDay } from '../utils/format'
import RhythmStrip from './RhythmStrip'

interface AirStatePanelProps {
  latest: SensorReading | null
  readings: SensorReading[]
  staleSeconds: number | null
  now: number
}

function shortLabel(aqi: number): string {
  const label = aqiToLabel(aqi)
  return label === 'Unhealthy for Sensitive Groups' ? 'Sensitive groups' : label
}

export default function AirStatePanel({ latest, readings, staleSeconds, now }: AirStatePanelProps) {
  const level = latest ? aqiToLevel(latest.aqi) : null

  // Marker position: equal-width segments, interpolated within the active band
  let markerLeft: number | null = null
  if (latest) {
    const aqi = Math.min(latest.aqi, 500)
    let idx = AQI_BANDS.findIndex(b => aqi <= b.hi)
    if (idx === -1) idx = AQI_BANDS.length - 1
    const band = AQI_BANDS[idx]
    const frac = Math.min(Math.max((aqi - band.lo) / (band.hi - band.lo), 0), 1)
    markerLeft = ((idx + frac) / AQI_BANDS.length) * 100
  }

  const dayKey = startOfLocalDay(now)

  const today = useMemo(() => {
    const rows = readings.filter(r => r.timestamp >= dayKey)
    if (rows.length === 0) return null

    let sum = 0
    let peak = -Infinity
    let peakTs = 0
    for (const r of rows) {
      sum += r.pm25
      if (r.pm25 > peak) {
        peak = r.pm25
        peakTs = r.timestamp
      }
    }

    const pairs = rows.filter(r => r.pm25_old != null)
    let ab = 'collecting pairs…'
    if (pairs.length > 0) {
      let newSum = 0
      let oldSum = 0
      for (const p of pairs) {
        newSum += p.pm25
        oldSum += p.pm25_old as number
      }
      const meanNew = newSum / pairs.length
      if (meanNew > 0) {
        const pct = ((oldSum / pairs.length - meanNew) / meanNew) * 100
        ab = `old ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}% · ${pairs.length} pairs`
      } else {
        ab = `${pairs.length} pairs`
      }
    }

    return {
      avg: sum / rows.length,
      peak,
      peakTime: new Date(peakTs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      ab
    }
  }, [readings, dayKey])

  return (
    <div className="air-state-panel">
      <div className="state-block">
        <div className="state-word" style={{ color: level ? LEVEL_COLORS[level] : 'var(--text-muted)' }}>
          {latest ? shortLabel(latest.aqi) : '—'}
        </div>
        <div className="state-meta">{latest ? `AQI ${latest.aqi} · PM2.5` : 'waiting for data'}</div>
        <div className="aqi-band-bar">
          {AQI_BANDS.map(b => (
            <div
              key={b.level}
              className="aqi-band-seg"
              style={{ background: `rgba(${LEVEL_RGB[b.level]}, ${b.level === level ? 0.9 : 0.28})` }}
            />
          ))}
          {markerLeft != null && <div className="aqi-band-marker" style={{ left: `${markerLeft}%` }} />}
        </div>
        {staleSeconds != null && (
          <div className="state-freshness">updated {formatAge(staleSeconds)} ago</div>
        )}
      </div>
      <RhythmStrip readings={readings} now={now} />
      <div className="panel-facts">
        <div className="panel-label">Today</div>
        <div className="panel-fact-row">
          <span className="panel-fact-label">PM2.5 avg</span>
          <span className="panel-fact-value">{today ? `${today.avg.toFixed(1)} µg/m³` : '—'}</span>
        </div>
        <div className="panel-fact-row">
          <span className="panel-fact-label">Peak</span>
          <span className="panel-fact-value">{today ? `${today.peak.toFixed(1)} · ${today.peakTime}` : '—'}</span>
        </div>
        <div className="panel-fact-row">
          <span className="panel-fact-label">A/B</span>
          <span className="panel-fact-value">{today ? today.ab : '—'}</span>
        </div>
      </div>
    </div>
  )
}
