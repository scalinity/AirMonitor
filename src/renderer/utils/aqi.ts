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

export function aqiToColor(aqi: number): string {
  if (aqi <= 50) return '#3fb950'
  if (aqi <= 100) return '#d29922'
  if (aqi <= 150) return '#db6d28'
  if (aqi <= 200) return '#f85149'
  if (aqi <= 300) return '#a371f7'
  return '#8b0000'
}
