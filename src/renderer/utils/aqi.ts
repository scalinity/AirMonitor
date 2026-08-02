import { AlertLevel } from '../../shared/types'

const PM25_BREAKPOINTS = [
  { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
]

export function pm25ToAqi(pm25: number): number {
  const truncated = Math.floor(pm25 * 10) / 10
  for (const bp of PM25_BREAKPOINTS) {
    if (truncated >= bp.cLow && truncated <= bp.cHigh) {
      return Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (truncated - bp.cLow) + bp.iLow)
    }
  }
  return truncated > 500.4 ? 500 : 0
}

export function aqiToLevel(aqi: number): AlertLevel {
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'moderate'
  if (aqi <= 150) return 'unhealthy_sensitive'
  if (aqi <= 200) return 'unhealthy'
  if (aqi <= 300) return 'very_unhealthy'
  return 'hazardous'
}

export function aqiToLabel(aqi: number): string {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

// Single source for level colors. Validated on the app surface (#080c14):
// adjacent-pair CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, contrast ≥ 3:1.
export const LEVEL_COLORS: Record<AlertLevel, string> = {
  good: '#3fb950',
  moderate: '#f2d160',
  unhealthy_sensitive: '#e6802f',
  unhealthy: '#d92f2f',
  very_unhealthy: '#a371f7',
  hazardous: '#b8434f'
}

export const LEVEL_RGB: Record<AlertLevel, string> = {
  good: '63, 185, 80',
  moderate: '242, 209, 96',
  unhealthy_sensitive: '230, 128, 47',
  unhealthy: '217, 47, 47',
  very_unhealthy: '163, 113, 247',
  hazardous: '184, 67, 79'
}

export const AQI_BANDS: { lo: number; hi: number; level: AlertLevel }[] = [
  { lo: 0, hi: 50, level: 'good' },
  { lo: 51, hi: 100, level: 'moderate' },
  { lo: 101, hi: 150, level: 'unhealthy_sensitive' },
  { lo: 151, hi: 200, level: 'unhealthy' },
  { lo: 201, hi: 300, level: 'very_unhealthy' },
  { lo: 301, hi: 500, level: 'hazardous' }
]

export function aqiToColor(aqi: number): string {
  return LEVEL_COLORS[aqiToLevel(aqi)]
}
