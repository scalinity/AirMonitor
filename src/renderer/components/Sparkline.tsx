import React from 'react'

interface SparklineProps {
  points: number[]
  stroke: string
}

export default function Sparkline({ points, stroke }: SparklineProps) {
  // Reserve the slot even without enough data so card heights stay constant
  if (points.length < 2) return <div className="metric-sparkline" />

  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p < min) min = p
    if (p > max) max = p
  }
  const flat = max - min < 1e-9
  const pad = (max - min) * 0.05
  const lo = min - pad
  const span = max + pad - lo

  const step = 100 / (points.length - 1)
  const pts = points
    .map((p, i) => {
      const x = i * step
      const y = flat ? 14 : 26 - ((p - lo) / span) * 24
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="metric-sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
