import React from 'react'
import { aqiToLabel, aqiToColor } from '../utils/aqi'

interface AqiGaugeProps {
  aqi: number
}

const SEGMENTS = [
  { max: 50, color: '#3fb950', label: 'Good' },
  { max: 100, color: '#d29922', label: 'Moderate' },
  { max: 150, color: '#db6d28', label: 'Sensitive' },
  { max: 200, color: '#f85149', label: 'Unhealthy' },
  { max: 300, color: '#a371f7', label: 'Very Unhealthy' },
  { max: 500, color: '#8b0000', label: 'Hazardous' }
]

export default function AqiGauge({ aqi }: AqiGaugeProps) {
  const clampedAqi = Math.min(Math.max(aqi, 0), 500)
  const cx = 120
  const cy = 120
  const radius = 90
  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle

  function polarToCartesian(angle: number): { x: number; y: number } {
    const rad = (angle * Math.PI) / 180
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    }
  }

  function describeArc(start: number, end: number): string {
    const s = polarToCartesian(start)
    const e = polarToCartesian(end)
    const largeArc = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`
  }

  const needleAngle = startAngle + (clampedAqi / 500) * totalAngle
  const needleLength = radius - 15

  const needleTip = {
    x: cx + needleLength * Math.cos((needleAngle * Math.PI) / 180),
    y: cy + needleLength * Math.sin((needleAngle * Math.PI) / 180)
  }

  const segmentArcs: { d: string; color: string }[] = []
  let prevMax = 0
  for (const seg of SEGMENTS) {
    const segStart = startAngle + (prevMax / 500) * totalAngle
    const segEnd = startAngle + (seg.max / 500) * totalAngle
    segmentArcs.push({ d: describeArc(segStart, segEnd), color: seg.color })
    prevMax = seg.max
  }

  const needleColor = aqiToColor(clampedAqi)

  return (
    <>
      <span className="gauge-title">Air Quality Index</span>
      <svg
        width="240"
        height="190"
        viewBox="0 0 240 190"
        role="img"
        aria-label={`AQI gauge showing ${Math.round(clampedAqi)}: ${aqiToLabel(clampedAqi)}`}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {segmentArcs.map((arc, i) => (
          <path
            key={i}
            d={arc.d}
            fill="none"
            stroke={arc.color}
            strokeWidth="14"
            strokeLinecap="round"
            opacity={0.3}
          />
        ))}
        {segmentArcs.map((arc, i) => {
          const segStart = SEGMENTS[i - 1]?.max ?? 0
          const segEnd = SEGMENTS[i].max
          if (clampedAqi < segStart) return null
          const effectiveEnd = Math.min(clampedAqi, segEnd)
          const arcStart = startAngle + (segStart / 500) * totalAngle
          const arcEnd = startAngle + (effectiveEnd / 500) * totalAngle
          if (arcEnd - arcStart < 0.5) return null
          return (
            <path
              key={`active-${i}`}
              d={describeArc(arcStart, arcEnd)}
              fill="none"
              stroke={arc.color}
              strokeWidth="14"
              strokeLinecap="round"
              filter="url(#glow)"
            />
          )
        })}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={needleColor}
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#glow)"
          style={{ transition: 'x2 0.5s ease, y2 0.5s ease' }}
        />
        <circle cx={cx} cy={cy} r="5" fill={needleColor} filter="url(#glow)" />
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          fill={aqiToColor(clampedAqi)}
          fontSize="38"
          fontWeight="700"
          fontFamily="'DM Mono', monospace"
        >
          {Math.round(clampedAqi)}
        </text>
        <text
          x={cx}
          y={cy + 50}
          textAnchor="middle"
          fill="#7a8494"
          fontSize="12"
          fontFamily="'Outfit', sans-serif"
        >
          {aqiToLabel(clampedAqi)}
        </text>
      </svg>
    </>
  )
}
