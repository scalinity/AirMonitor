import { EventEmitter } from 'events'
import mqtt, { MqttClient } from 'mqtt'
import { SensorReading, ConnectionStatus } from '../shared/types'

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

const MAX_PAYLOAD_SIZE = 4096

export class MqttSensorClient extends EventEmitter {
  private client: MqttClient | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private topic = ''

  connect(brokerUrl: string, topic: string): void {
    this.topic = topic
    this.disconnect()
    this.reconnectDelay = 1000

    this.client = mqtt.connect(brokerUrl, {
      reconnectPeriod: 0,
      connectTimeout: 10000
    })

    this.client.on('connect', () => {
      this.reconnectDelay = 1000
      this.emit('status', 'connected' as ConnectionStatus)
      this.client!.subscribe(topic, (err) => {
        if (err) console.error('MQTT subscribe error')
      })
    })

    this.client.on('message', (_topic, payload) => {
      try {
        if (payload.length > MAX_PAYLOAD_SIZE) return
        const data = JSON.parse(payload.toString())
        if (typeof data.pm25 !== 'number' || typeof data.pm10 !== 'number') return
        if (!Number.isFinite(data.pm25) || !Number.isFinite(data.pm10)) return
        if (data.pm25 < 0 || data.pm25 > 1000 || data.pm10 < 0 || data.pm10 > 1000) return

        const now = Date.now()
        const timestamp = (typeof data.timestamp === 'number' &&
          Number.isFinite(data.timestamp) &&
          Math.abs(data.timestamp - now) < 60_000) ? data.timestamp : now

        const temperature = typeof data.temperature === 'number' && Number.isFinite(data.temperature)
          ? data.temperature : 0
        const humidity = typeof data.humidity === 'number' && Number.isFinite(data.humidity)
          ? data.humidity : 0

        const reading: SensorReading = {
          timestamp,
          pm25: data.pm25,
          pm10: data.pm10,
          temperature,
          humidity,
          aqi: pm25ToAqi(data.pm25)
        }
        this.emit('data', reading)
      } catch {
        // drop malformed JSON
      }
    })

    this.client.on('close', () => {
      this.emit('status', 'disconnected' as ConnectionStatus)
      this.scheduleReconnect()
    })

    this.client.on('error', (err) => {
      const safeMessage = err.message?.replace(/mqtt[s]?:\/\/[^\s]+/g, 'mqtt://[REDACTED]')
      console.error('MQTT connection error:', safeMessage)
    })
  }

  private scheduleReconnect(): void {
    if (!this.client) return
    this.emit('status', 'reconnecting' as ConnectionStatus)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.client) {
        this.client.reconnect()
      }
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }

  publish(topic: string, payload: string): void {
    if (this.client?.connected) {
      this.client.publish(topic, payload)
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.client) {
      this.client.removeAllListeners()
      this.client.end(true)
      this.client = null
    }
  }
}
