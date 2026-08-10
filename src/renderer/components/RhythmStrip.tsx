import React, { useState, useMemo } from 'react'
import { SensorReading } from '../../shared/types'
import { getAlertLevel } from '../utils/thresholds'
import { LEVEL_COLORS } from '../utils/aqi'
import { startOfLocalDay } from '../utils/format'
import { combinedPm } from '../utils/calibration'

interface RhythmStripProps {
  readings: SensorReading[]
  now: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function hourLabel(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

export default function RhythmStrip({ readings, now }: RhythmStripProps) {
  // Fetch the six days before today; today's row derives live from the
  // readings prop. A useState initializer instead of an effect: the setter is
  // a no-op if the component is gone, and StrictMode's dev double-invoke just
  // repeats an idempotent read. Re-fetches whenever a Pi sync lands — on the
  // first launch after time away the local store is stale and the sync arrives
  // seconds after this initial read. The subscription lives for the app's
  // lifetime, matching this component's.
  const [pastRows, setPastRows] = useState<SensorReading[] | null>(() => {
    const fetchPast = () => {
      window.api.getHistory(startOfLocalDay(Date.now()) - 6 * DAY_MS)
        .then(rows => setPastRows(rows))
        .catch(() => setPastRows([]))
    }
    fetchPast()
    window.api.onHistoryUpdated(fetchPast)
    return null
  })

  const dayKey = startOfLocalDay(now)

  const days = useMemo(() => {
    const t = new Date(dayKey)
    // Date-constructor arithmetic keeps local-midnight boundaries across DST
    const dayStart = (back: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - back).getTime()
    const starts = Array.from({ length: 7 }, (_, i) => dayStart(6 - i))
    const todayStart = starts[6]
    const indexByStart = new Map(starts.map((s, i) => [s, i]))

    const sums = starts.map(() => new Array<number>(24).fill(0))
    const counts = starts.map(() => new Array<number>(24).fill(0))

    const source = [
      ...(pastRows ?? []).filter(r => r.timestamp < todayStart),
      ...readings.filter(r => r.timestamp >= todayStart)
    ]
    for (const r of source) {
      const d = new Date(r.timestamp)
      const dayIdx = indexByStart.get(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())
      if (dayIdx === undefined) continue
      const h = d.getHours()
      sums[dayIdx][h] += combinedPm('pm25', r)
      counts[dayIdx][h]++
    }

    return starts.map((start, i) => ({
      start,
      isToday: i === 6,
      weekday: new Date(start).toLocaleDateString([], { weekday: 'short' }),
      date: new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      cells: sums[i].map((sum, h) => (counts[i][h] > 0 ? sum / counts[i][h] : null))
    }))
  }, [pastRows, readings, dayKey])

  return (
    <div className="rhythm-strip">
      <div className="panel-label">7-day rhythm · hourly PM2.5</div>
      <div className="rhythm-grid" role="img" aria-label="Heatmap of hourly average PM2.5 over the last 7 days">
        {days.map(day => (
          <React.Fragment key={day.start}>
            <div className={`rhythm-day-label${day.isToday ? ' today' : ''}`} title={day.date}>
              {day.weekday}
            </div>
            {day.cells.map((mean, h) =>
              mean == null ? (
                <div key={h} className="rhythm-cell empty" title={`${day.weekday} ${hourLabel(h)} · no data`} />
              ) : (
                <div
                  key={h}
                  className="rhythm-cell"
                  style={{ background: LEVEL_COLORS[getAlertLevel('pm25', mean)] }}
                  title={`${day.weekday} ${hourLabel(h)} · ${mean.toFixed(1)} µg/m³`}
                />
              )
            )}
          </React.Fragment>
        ))}
        <div />
        {[0, 6, 12, 18].map(h => (
          <div key={h} className="rhythm-hour-label" style={{ gridColumn: 'span 6' }}>
            {hourLabel(h)}
          </div>
        ))}
      </div>
    </div>
  )
}
