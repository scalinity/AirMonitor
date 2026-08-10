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
import { combinedPm } from '../utils/calibration'

interface TimeSeriesChartProps {
  readings: SensorReading[]
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | '14d' | '30d'
type MetricView = 'pm' | 'temperature' | 'humidity' | 'ab'
type AbMetric = 'pm25' | 'pm10'

const AB_COLORS: Record<AbMetric, string> = { pm25: '#00d4aa', pm10: '#4b9fff' }
// Old-sensor hue: validated CVD-safe against both metric hues; dashed as secondary encoding
const AB_OLD_COLOR = '#e0679f'

const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
}

const EXTENDED_RANGES = new Set<TimeRange>(['7d', '14d', '30d'])

function celsiusToFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 * 10 + 320) / 10
}

// Hourly aggregation bucket size for extended ranges
const HOUR_MS = 60 * 60 * 1000

// Full label for tooltips
function formatTimeLabel(timestamp: number, range: TimeRange): string {
  const date = new Date(timestamp)
  if (EXTENDED_RANGES.has(range)) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Compact label for axis ticks
function formatTick(timestamp: number, range: TimeRange): string {
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
  // Combined (both sensors, calibrated) — what the PM view plots; raw fields
  // stay for the A/B view
  pm25c: number
  pm10c: number
  temperature: number
  humidity: number
  pm25_old?: number | null
  pm10_old?: number | null
}

function aggregateHourly(readings: SensorReading[]): ChartPoint[] {
  if (readings.length === 0) return []

  const buckets = new Map<number, { pm25Sum: number; pm10Sum: number; pm25cSum: number; pm10cSum: number; tempSum: number; humSum: number; count: number; pm25OldSum: number; pm10OldSum: number; oldCount: number }>()

  for (const r of readings) {
    const bucketKey = Math.floor(r.timestamp / HOUR_MS) * HOUR_MS
    let bucket = buckets.get(bucketKey)
    if (!bucket) {
      bucket = { pm25Sum: 0, pm10Sum: 0, pm25cSum: 0, pm10cSum: 0, tempSum: 0, humSum: 0, count: 0, pm25OldSum: 0, pm10OldSum: 0, oldCount: 0 }
      buckets.set(bucketKey, bucket)
    }
    bucket.pm25Sum += r.pm25
    bucket.pm10Sum += r.pm10
    bucket.pm25cSum += combinedPm('pm25', r)
    bucket.pm10cSum += combinedPm('pm10', r)
    bucket.tempSum += r.temperature
    bucket.humSum += r.humidity
    bucket.count++
    if (r.pm25_old != null && r.pm10_old != null) {
      bucket.pm25OldSum += r.pm25_old
      bucket.pm10OldSum += r.pm10_old
      bucket.oldCount++
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, bucket]) => ({
      timestamp: ts,
      pm25: Math.round((bucket.pm25Sum / bucket.count) * 10) / 10,
      pm10: Math.round((bucket.pm10Sum / bucket.count) * 10) / 10,
      pm25c: Math.round((bucket.pm25cSum / bucket.count) * 10) / 10,
      pm10c: Math.round((bucket.pm10cSum / bucket.count) * 10) / 10,
      temperature: celsiusToFahrenheit(bucket.tempSum / bucket.count),
      humidity: Math.round((bucket.humSum / bucket.count) * 10) / 10,
      // Honest gaps: hours with no old-sensor samples stay null rather than interpolating
      pm25_old: bucket.oldCount > 0 ? Math.round((bucket.pm25OldSum / bucket.oldCount) * 10) / 10 : null,
      pm10_old: bucket.oldCount > 0 ? Math.round((bucket.pm10OldSum / bucket.oldCount) * 10) / 10 : null
    }))
}

interface AbTooltipProps {
  active?: boolean
  label?: number | string
  payload?: { dataKey?: string | number; value?: number | null }[]
  abMetric: AbMetric
  range: TimeRange
}

function AbTooltip({ active, label, payload, abMetric, range }: AbTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const byKey = (k: string) => payload.find(p => p.dataKey === k)?.value
  const newVal = byKey(abMetric)
  const oldVal = byKey(`${abMetric}_old`)
  const delta = typeof newVal === 'number' && typeof oldVal === 'number' ? oldVal - newVal : null

  const row: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }
  const dot = (color: string): React.CSSProperties => ({
    display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 6
  })

  return (
    <div style={{
      background: 'rgba(15, 21, 32, 0.92)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '10px 12px',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
      fontFamily: "'DM Mono', monospace",
      fontSize: 12,
      color: '#e6edf3',
      minWidth: 150
    }}>
      <div style={{ color: '#7a8494', marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
        {typeof label === 'number' ? formatTimeLabel(label, range) : label}
      </div>
      <div style={row}>
        <span><span style={dot(AB_COLORS[abMetric])} />New</span>
        <span>{typeof newVal === 'number' ? newVal.toFixed(1) : '—'}</span>
      </div>
      <div style={{ ...row, marginTop: 4 }}>
        <span><span style={dot(AB_OLD_COLOR)} />Old</span>
        <span>{typeof oldVal === 'number' ? oldVal.toFixed(1) : '—'}</span>
      </div>
      <div style={{ ...row, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', color: '#7a8494' }}>
        <span>Δ old−new</span>
        <span>{delta !== null ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}` : '—'}</span>
      </div>
    </div>
  )
}

export default function TimeSeriesChart({ readings }: TimeSeriesChartProps) {
  const [range, setRange] = useState<TimeRange>('1h')
  const [metric, setMetric] = useState<MetricView>('pm')
  const [abMetric, setAbMetric] = useState<AbMetric>('pm25')
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
    // Filter by time range; omit bad DHT11 reads only for temp/humidity views
    const filtered = source.filter(r => r.timestamp >= cutoff &&
      (metric === 'pm' || metric === 'ab' || !(r.temperature === 0 && r.humidity === 0)))

    if (isExtended) {
      return aggregateHourly(filtered)
    }

    return filtered.map(r => ({
      ...r,
      temperature: celsiusToFahrenheit(r.temperature),
      pm25c: Math.round(combinedPm('pm25', r) * 10) / 10,
      pm10c: Math.round(combinedPm('pm10', r) * 10) / 10
    }))
  }, [readings, extendedReadings, range, metric])

  const yMax = useMemo(() => {
    if (filteredData.length === 0) return 10
    let values: number[]
    if (metric === 'pm') {
      values = filteredData.map(r => Math.max(r.pm25c, r.pm10c))
    } else if (metric === 'ab') {
      values = filteredData.map(r => Math.max(r[abMetric], r[`${abMetric}_old`] ?? 0))
    } else if (metric === 'temperature') {
      values = filteredData.map(r => r.temperature)
    } else {
      values = filteredData.map(r => r.humidity)
    }
    values.sort((a, b) => a - b)
    const refIndex = values.length > 20
      ? Math.floor(values.length * 0.95)
      : values.length - 1
    const ref = values[refIndex]
    return Math.max(Math.ceil(ref * 1.2), 2)
  }, [filteredData, metric])

  const yMin = useMemo(() => {
    if (metric !== 'temperature' || filteredData.length === 0) return 0
    let min = Infinity
    for (const r of filteredData) { if (r.temperature < min) min = r.temperature }
    return Math.max(Math.floor(min - 5), 0)
  }, [filteredData, metric])

  const yUnit = metric === 'pm' || metric === 'ab' ? '' : metric === 'temperature' ? '°F' : '%'

  // Deterministic ~6 ticks: numeric interval keeps every (n+1)th label
  const tickInterval = Math.max(0, Math.ceil(filteredData.length / 6) - 1)

  const abPointCount = useMemo(() => {
    if (metric !== 'ab') return 0
    return filteredData.reduce((n, r) => n + (r[`${abMetric}_old`] != null ? 1 : 0), 0)
  }, [filteredData, metric, abMetric])

  return (
    <>
      <div className="chart-header">
        <div className="chart-header-left">
          <div className="chart-segmented">
            {([['pm', 'PM'], ['temperature', 'Temp'], ['humidity', 'Humidity'], ['ab', 'A/B']] as [MetricView, string][]).map(([m, label]) => (
              <button
                key={m}
                className={`chart-range-btn ${metric === m ? 'active' : ''}`}
                onClick={() => setMetric(m)}
              >
                {label}
              </button>
            ))}
          </div>
          {metric === 'ab' && (
            <div className="chart-segmented">
              {([['pm25', 'PM2.5'], ['pm10', 'PM10']] as [AbMetric, string][]).map(([m, label]) => (
                <button
                  key={m}
                  className={`chart-range-btn ${abMetric === m ? 'active' : ''}`}
                  onClick={() => setAbMetric(m)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
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
      <div className="chart-canvas">
      {loading && <div className="chart-notice">Loading…</div>}
      {metric === 'ab' && !loading && abPointCount === 0 && (
        <div className="chart-notice">
          No old-sensor data in this range yet — pairs record while both sensors are connected.
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
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
            <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff8c42" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ff8c42" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradHumidity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c5cfc" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#7c5cfc" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="timestamp"
            stroke="rgba(255,255,255,0.06)"
            tick={{ fill: '#7a8494', fontSize: 11, fontFamily: "'DM Mono', monospace" }}
            tickLine={false}
            tickMargin={8}
            interval={tickInterval}
            tickFormatter={(ts: number) => formatTick(ts, range)}
          />
          <YAxis
            stroke="rgba(255,255,255,0.06)"
            tick={{ fill: '#7a8494', fontSize: 11, fontFamily: "'DM Mono', monospace" }}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            unit={yUnit}
          />
          {metric === 'ab' ? (
            <Tooltip
              content={<AbTooltip abMetric={abMetric} range={range} />}
              cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeDasharray: '3 3' }}
            />
          ) : (
            <Tooltip
              labelFormatter={(ts) => formatTimeLabel(Number(ts), range)}
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
          )}
          {/* Always present with a fixed height so the plot doesn't jump between metric views */}
          <Legend height={24} wrapperStyle={{ color: '#7a8494', fontSize: 12, fontFamily: "'Outfit', sans-serif" }} />
          {metric === 'pm' && (
            <>
              <Area
                type="monotone"
                dataKey="pm25c"
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
                dataKey="pm10c"
                name="PM10"
                stroke="#4b9fff"
                strokeWidth={2}
                fill="url(#gradPm10)"
                dot={false}
                activeDot={{ r: 5, fill: '#4b9fff', stroke: 'rgba(75,159,255,0.3)', strokeWidth: 6 }}
                isAnimationActive={false}
              />
            </>
          )}
          {metric === 'ab' && (
            <>
              <Area
                type="monotone"
                dataKey={abMetric}
                name="New sensor"
                stroke={AB_COLORS[abMetric]}
                strokeWidth={2}
                fill={abMetric === 'pm25' ? 'url(#gradPm25)' : 'url(#gradPm10)'}
                dot={false}
                activeDot={{ r: 5, fill: AB_COLORS[abMetric], stroke: `${AB_COLORS[abMetric]}4d`, strokeWidth: 6 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey={`${abMetric}_old`}
                name="Old sensor"
                stroke={AB_OLD_COLOR}
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="transparent"
                dot={false}
                connectNulls={false}
                activeDot={{ r: 5, fill: AB_OLD_COLOR, stroke: 'rgba(224,103,159,0.3)', strokeWidth: 6 }}
                isAnimationActive={false}
              />
            </>
          )}
          {metric === 'temperature' && (
            <Area
              type="monotone"
              dataKey="temperature"
              name="Temperature (°F)"
              stroke="#ff8c42"
              strokeWidth={2}
              fill="url(#gradTemp)"
              dot={false}
              activeDot={{ r: 5, fill: '#ff8c42', stroke: 'rgba(255,140,66,0.3)', strokeWidth: 6 }}
              isAnimationActive={false}
            />
          )}
          {metric === 'humidity' && (
            <Area
              type="monotone"
              dataKey="humidity"
              name="Humidity (%)"
              stroke="#7c5cfc"
              strokeWidth={2}
              fill="url(#gradHumidity)"
              dot={false}
              activeDot={{ r: 5, fill: '#7c5cfc', stroke: 'rgba(124,92,252,0.3)', strokeWidth: 6 }}
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </>
  )
}
