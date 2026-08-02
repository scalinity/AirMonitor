import React from 'react'
import { AlertLevel } from '../../shared/types'
import Sparkline from './Sparkline'

interface MetricCardProps {
  label: string
  value: number | null
  unit: string
  level: AlertLevel
  delta: { value: number; spanMin: number } | null
  spark: { points: number[]; stroke: string }
  index?: number
  // Same metric read by a second sensor at the same moment (A/B comparison)
  secondary?: { label: string; value: number } | null
}

export default function MetricCard({ label, value, unit, level, delta, spark, index = 0, secondary = null }: MetricCardProps) {
  const secDelta = secondary != null && value !== null ? secondary.value - value : null
  // Beyond SDS011 unit-to-unit tolerance — the sensors genuinely disagree
  const diverged = secDelta !== null && value !== null &&
    Math.abs(secDelta) > Math.max(5, Math.abs(value) * 0.25)

  let deltaText = '—'
  if (delta !== null) {
    deltaText = Math.abs(delta.value) < 0.5
      ? '— steady'
      : `${delta.value > 0 ? '↑' : '↓'} ${Math.abs(delta.value).toFixed(1)} · ${delta.spanMin}m`
  }

  return (
    <div className={`metric-card level-${level}`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">
        <span className="metric-card-number">
          {value !== null ? value.toFixed(1) : '--'}
        </span>
        <span className="metric-card-unit">{unit}</span>
      </div>
      {secondary != null && secDelta !== null && (
        <div className="metric-card-secondary">
          <span className="metric-card-secondary-label">{secondary.label}</span>
          <span className="metric-card-secondary-value">{secondary.value.toFixed(1)}</span>
          <span className={`metric-card-secondary-delta${diverged ? ' diverged' : ''}`}>
            {secDelta >= 0 ? '+' : '−'}{Math.abs(secDelta).toFixed(1)}
          </span>
        </div>
      )}
      <Sparkline points={spark.points} stroke={spark.stroke} />
      <div className="metric-card-delta">{deltaText}</div>
    </div>
  )
}
