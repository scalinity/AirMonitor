import React, { useState, useMemo, useEffect, useRef } from 'react'
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

type TimeRange = '1h' | '6h' | '24h' | '7d' | '14d' | '30d'

const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
}

const EXTENDED_RANGES = new Set<TimeRange>(['7d', '14d', '30d'])

// Hourly aggregation bucket size for extended ranges
const HOUR_MS = 60 * 60 * 1000

function formatTimeLabel(timestamp: number, range: TimeRange): string {
  const date = new Date(timestamp)
  if (EXTENDED_RANGES.has(range)) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface ChartPoint {
  timestamp: number
  pm25: number
  pm10: number
  time: string
}

function aggregateHourly(readings: SensorReading[], range: TimeRange): ChartPoint[] {
  if (readings.length === 0) return []

  const buckets = new Map<number, { pm25Sum: number; pm10Sum: number; count: number }>()

  for (const r of readings) {
    const bucketKey = Math.floor(r.timestamp / HOUR_MS) * HOUR_MS
    const existing = buckets.get(bucketKey)
    if (existing) {
      existing.pm25Sum += r.pm25
      existing.pm10Sum += r.pm10
      existing.count++
    } else {
      buckets.set(bucketKey, { pm25Sum: r.pm25, pm10Sum: r.pm10, count: 1 })
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, bucket]) => ({
      timestamp: ts,
      pm25: Math.round((bucket.pm25Sum / bucket.count) * 10) / 10,
      pm10: Math.round((bucket.pm10Sum / bucket.count) * 10) / 10,
      time: formatTimeLabel(ts, range)
    }))
}

export default function TimeSeriesChart({ readings }: TimeSeriesChartProps) {
  const [range, setRange] = useState<TimeRange>('1h')
  const [extendedReadings, setExtendedReadings] = useState<SensorReading[]>([])
  const [loading, setLoading] = useState(false)
  const fetchedRangeRef = useRef<TimeRange | null>(null)

  // Fetch extended data when switching to a multi-day range
  useEffect(() => {
    if (!EXTENDED_RANGES.has(range)) {
      fetchedRangeRef.current = null
      return
    }

    // Already fetched for this or a wider range
    if (fetchedRangeRef.current && RANGE_MS[fetchedRangeRef.current] >= RANGE_MS[range]) {
      return
    }

    setLoading(true)
    const since = Date.now() - RANGE_MS[range]
    window.api.getHistory(since).then((history) => {
      setExtendedReadings(history)
      fetchedRangeRef.current = range
    }).catch((err) => {
      console.error('Failed to load extended history:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [range])

  // Invalidate extended cache when Pi sync completes
  useEffect(() => {
    const remove = window.api.onHistoryUpdated(() => {
      fetchedRangeRef.current = null
      if (EXTENDED_RANGES.has(range)) {
        const since = Date.now() - RANGE_MS[range]
        window.api.getHistory(since).then(setExtendedReadings).catch(() => {})
      }
    })
    return remove
  }, [range])

  const filteredData = useMemo(() => {
    const isExtended = EXTENDED_RANGES.has(range)
    const source = isExtended ? extendedReadings : readings
    const cutoff = Date.now() - RANGE_MS[range]
    const filtered = source.filter(r => r.timestamp >= cutoff)

    if (isExtended) {
      return aggregateHourly(filtered, range)
    }

    return filtered.map(r => ({
      ...r,
      time: formatTimeLabel(r.timestamp, range)
    }))
  }, [readings, extendedReadings, range])

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
          {(['1h', '6h', '24h', '7d', '14d', '30d'] as TimeRange[]).map(r => (
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
      {loading && <div style={{ color: '#7a8494', fontSize: 12, padding: '4px 0' }}>Loading...</div>}
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
