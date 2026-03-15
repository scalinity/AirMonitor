import React, { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'
import { SensorReading } from '../../shared/types'

interface TimeSeriesChartProps {
  readings: SensorReading[]
}

type TimeRange = '1h' | '6h' | '24h'

const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000
}

export default function TimeSeriesChart({ readings }: TimeSeriesChartProps) {
  const [range, setRange] = useState<TimeRange>('1h')

  const filteredData = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range]
    return readings
      .filter(r => r.timestamp >= cutoff)
      .map(r => ({
        ...r,
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }))
  }, [readings, range])

  const yMax = useMemo(() => {
    if (filteredData.length === 0) return 10
    const values = filteredData.map(r => Math.max(r.pm25, r.pm10)).sort((a, b) => a - b)
    const refIndex = values.length > 20
      ? Math.floor(values.length * 0.95)
      : values.length - 1
    const ref = values[refIndex]
    return Math.max(Math.ceil(ref * 1.5), 2)
  }, [filteredData])

  return (
    <>
      <div className="chart-header">
        <span className="chart-title">Particulate Matter</span>
        <div className="chart-range-buttons">
          {(['1h', '6h', '24h'] as TimeRange[]).map(r => (
            <button
              key={r}
              className={`chart-range-btn ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={filteredData}>
          <defs>
            <linearGradient id="gradPm25" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#00d4aa" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradPm10" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4b9fff" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#4b9fff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="time"
            stroke="rgba(255,255,255,0.06)"
            tick={{ fill: '#7a8494', fontSize: 11, fontFamily: "'DM Mono', monospace" }}
            tickLine={false}
          />
          <YAxis
            stroke="rgba(255,255,255,0.06)"
            tick={{ fill: '#7a8494', fontSize: 11, fontFamily: "'DM Mono', monospace" }}
            tickLine={false}
            axisLine={false}
            domain={[0, yMax]}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15, 21, 32, 0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              color: '#e6edf3',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              fontFamily: "'DM Mono', monospace",
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ color: '#7a8494', fontSize: 12, fontFamily: "'Outfit', sans-serif" }} />
          <Area
            type="monotone"
            dataKey="pm25"
            name="PM2.5"
            stroke="#00d4aa"
            strokeWidth={2}
            fill="url(#gradPm25)"
            dot={false}
            activeDot={{ r: 5, fill: '#00d4aa', stroke: 'rgba(0,212,170,0.3)', strokeWidth: 6 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="pm10"
            name="PM10"
            stroke="#4b9fff"
            strokeWidth={2}
            fill="url(#gradPm10)"
            dot={false}
            activeDot={{ r: 5, fill: '#4b9fff', stroke: 'rgba(75,159,255,0.3)', strokeWidth: 6 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </>
  )
}
