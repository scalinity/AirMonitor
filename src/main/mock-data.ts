import { SensorReading } from '../shared/types'

let lastReading: SensorReading | null = null

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function drift(current: number, min: number, max: number, maxDelta: number): number {
  const delta = (Math.random() - 0.5) * 2 * maxDelta
  return clamp(current + delta, min, max)
}

function pm25ToAqi(pm25: number): number {
  const truncated = Math.floor(pm25 * 10) / 10
  const breakpoints = [
    { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
  ]
  for (const bp of breakpoints) {
    if (truncated >= bp.cLow && truncated <= bp.cHigh) {
      return Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (truncated - bp.cLow) + bp.iLow)
    }
  }
  return truncated > 500.4 ? 500 : 0
}

export function generateMockReading(): SensorReading {
  if (!lastReading) {
    const pm25Raw = 15 + Math.random() * 20
    const pm25 = Math.round(pm25Raw * 10) / 10
    lastReading = {
      timestamp: Date.now(),
      pm25,
      pm10: Math.round((pm25Raw * 1.8 + Math.random() * 10) * 10) / 10,
      temperature: Math.round((22 + Math.random() * 4) * 10) / 10,
      humidity: Math.round((50 + Math.random() * 10) * 10) / 10,
      aqi: pm25ToAqi(pm25)
    }
    return lastReading
  }

  const pm25 = Math.round(drift(lastReading.pm25, 2, 80, 3) * 10) / 10
  const pm10 = Math.round(drift(lastReading.pm10, 5, 150, 5) * 10) / 10
  const temperature = Math.round(drift(lastReading.temperature, 18, 32, 0.3) * 10) / 10
  const humidity = Math.round(drift(lastReading.humidity, 30, 80, 1) * 10) / 10

  lastReading = {
    timestamp: Date.now(),
    pm25,
    pm10,
    temperature,
    humidity,
    aqi: pm25ToAqi(pm25)
  }

  return lastReading
}
