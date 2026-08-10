import { SensorReading } from '../../shared/types'

// OLS fit of old-sensor vs new-sensor readings: 4,749 simultaneous pairs,
// 2026-08-01 → 2026-08-09, r = 0.998 on both channels. old = slope×new + intercept.
export const CAL = {
  pm25: { slope: 0.8534, intercept: 0.403 },
  pm10: { slope: 0.8489, intercept: -1.011 }
}

// Old-sensor reading mapped onto the new sensor's scale
export function calibrateOld(metric: 'pm25' | 'pm10', oldValue: number): number {
  const { slope, intercept } = CAL[metric]
  return (oldValue - intercept) / slope
}

// Displayed value: mean of the two sensors after calibration, or the primary
// alone when no pair exists. Clamped at zero — calibration can dip below it
// at the noise floor.
export function combinedPm(metric: 'pm25' | 'pm10', r: SensorReading): number {
  const oldValue = metric === 'pm25' ? r.pm25_old : r.pm10_old
  if (oldValue == null) return r[metric]
  return Math.max(0, (r[metric] + calibrateOld(metric, oldValue)) / 2)
}
