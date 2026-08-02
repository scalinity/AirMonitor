import { AlertLevel } from '../../shared/types'
import { aqiToLevel } from './aqi'

export function getAlertLevel(metric: string, value: number): AlertLevel {
  if (metric === 'aqi') return aqiToLevel(value)

  if (metric === 'pm25') {
    if (value <= 12) return 'good'
    if (value <= 35.4) return 'moderate'
    if (value <= 55.4) return 'unhealthy_sensitive'
    if (value <= 150.4) return 'unhealthy'
    if (value <= 250.4) return 'very_unhealthy'
    return 'hazardous'
  }

  if (metric === 'pm10') {
    if (value <= 54) return 'good'
    if (value <= 154) return 'moderate'
    if (value <= 254) return 'unhealthy_sensitive'
    if (value <= 354) return 'unhealthy'
    if (value <= 424) return 'very_unhealthy'
    return 'hazardous'
  }

  return 'good'
}

export { LEVEL_COLORS } from './aqi'
