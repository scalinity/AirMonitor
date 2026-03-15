import React from 'react'
import { AlertLevel } from '../../shared/types'

interface MetricCardProps {
  label: string
  value: number | null
  unit: string
  level: AlertLevel
  trend: 'up' | 'down' | 'stable'
  index?: number
}

export default function MetricCard({ label, value, unit, level, trend, index = 0 }: MetricCardProps) {
  const trendSymbol = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '─'

  return (
    <div className={`metric-card level-${level}`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">
        <span className="metric-card-number">
          {value !== null ? value.toFixed(1) : '--'}
        </span>
        <span className="metric-card-unit">{unit}</span>
      </div>
      {value !== null && (
        <div className={`metric-card-trend ${trend}`}>{trendSymbol}</div>
      )}
    </div>
  )
}
