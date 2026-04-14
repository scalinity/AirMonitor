/**
 * Minimal MQTT client using browser-native WebSocket.
 * This bypasses macOS's local network block on Node.js TCP sockets
 * by using Chromium's WebSocket implementation.
 */

type MqttCallback = (topic: string, payload: string) => void
type StatusCallback = (status: 'connected' | 'disconnected' | 'reconnecting') => void

// MQTT packet types
const CONNECT = 1
const CONNACK = 2
const PUBLISH = 3
const SUBSCRIBE = 8
const SUBACK = 9
const PINGREQ = 12
const PINGRESP = 13

function encodeLength(length: number): number[] {
  const bytes: number[] = []
  do {
    let byte = length % 128
    length = Math.floor(length / 128)
    if (length > 0) byte |= 0x80
    bytes.push(byte)
  } while (length > 0)
  return bytes
}

function encodeString(str: string): number[] {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  return [bytes.length >> 8, bytes.length & 0xff, ...Array.from(bytes)]
}

function buildConnectPacket(clientId: string): Uint8Array {
  const protocol = encodeString('MQTT')
  const level = 4 // MQTT 3.1.1
  const flags = 2 // Clean session
  const keepalive = [0, 60] // 60 seconds
  const id = encodeString(clientId)
  const payload = [...protocol, level, flags, ...keepalive, ...id]
  const header: number[] = [CONNECT << 4, ...encodeLength(payload.length)]
  return new Uint8Array([...header, ...payload])
}

function buildSubscribePacket(topic: string, packetId: number): Uint8Array {
  const id = [packetId >> 8, packetId & 0xff]
  const topicBytes = encodeString(topic)
  const qos = 0
  const payload = [...id, ...topicBytes, qos]
  const header = [(SUBSCRIBE << 4) | 2, ...encodeLength(payload.length)]
  return new Uint8Array([...header, ...payload])
}

function buildPublishPacket(topic: string, message: string): Uint8Array {
  const topicBytes = encodeString(topic)
  const encoder = new TextEncoder()
  const msgBytes = encoder.encode(message)
  const payload = [...topicBytes, ...Array.from(msgBytes)]
  const header = [PUBLISH << 4, ...encodeLength(payload.length)]
  return new Uint8Array([...header, ...payload])
}

function buildPingreqPacket(): Uint8Array {
  return new Uint8Array([PINGREQ << 4, 0])
}

export class BrowserMqttClient {
  private ws: WebSocket | null = null
  private onMessage: MqttCallback | null = null
  private onStatus: StatusCallback | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private brokerUrl = ''
  private topic = ''
  private buffer = new Uint8Array(0)
  private packetId = 1
  private destroyed = false

  connect(brokerUrl: string, topic: string): void {
    this.brokerUrl = brokerUrl
    this.topic = topic
    this.destroyed = false
    this.doConnect()
  }

  private doConnect(): void {
    if (this.destroyed) return
    this.buffer = new Uint8Array(0)
    try {
      this.ws = new WebSocket(this.brokerUrl, 'mqtt')
      this.ws.binaryType = 'arraybuffer'
    } catch (e) {
      console.error('WebSocket creation failed:', e)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      const clientId = 'airmonitor_' + Math.random().toString(36).substring(2, 10)
      this.ws!.send(buildConnectPacket(clientId))
    }

    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer) as Uint8Array
      this.buffer = this.concatBuffers(this.buffer, data) as Uint8Array
      this.parsePackets()
    }

    this.ws.onclose = () => {
      this.stopPing()
      this.onStatus?.('disconnected')
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose fires after onerror and handles reconnect
    }
  }

  private parsePackets(): void {
    while (this.buffer.length >= 2) {
      const type = this.buffer[0] >> 4
      let multiplier = 1
      let length = 0
      let i = 1
      let lengthComplete = false
      for (; i < this.buffer.length && i < 5; i++) {
        length += (this.buffer[i] & 0x7f) * multiplier
        multiplier *= 128
        if ((this.buffer[i] & 0x80) === 0) { lengthComplete = true; break }
      }
      if (!lengthComplete) return
      i++ // move past length bytes
      const totalLength = i + length
      if (this.buffer.length < totalLength) return // incomplete packet

      this.handlePacket(type, this.buffer.slice(i, totalLength))
      this.buffer = this.buffer.slice(totalLength)
    }
  }

  private handlePacket(type: number, payload: Uint8Array): void {
    if (type === CONNACK) {
      if (payload.length >= 2 && payload[1] === 0) {
        this.onStatus?.('connected')
        this.ws!.send(buildSubscribePacket(this.topic, this.packetId++))
        this.startPing()
      }
    } else if (type === PUBLISH) {
      const topicLen = (payload[0] << 8) | payload[1]
      const decoder = new TextDecoder()
      const topic = decoder.decode(payload.slice(2, 2 + topicLen))
      const message = decoder.decode(payload.slice(2 + topicLen))
      this.onMessage?.(topic, message)
    } else if (type === SUBACK) {
      // subscription confirmed
    } else if (type === PINGRESP) {
      // pong received
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(buildPingreqPacket())
      }
    }, 30000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return
    this.onStatus?.('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, 5000)
  }

  publish(topic: string, message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buildPublishPacket(topic, message))
    }
  }

  onData(callback: MqttCallback): void {
    this.onMessage = callback
  }

  onStatusChange(callback: StatusCallback): void {
    this.onStatus = callback
  }

  disconnect(): void {
    this.destroyed = true
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }

  private concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length)
    result.set(a)
    result.set(b, a.length)
    return result
  }
}
