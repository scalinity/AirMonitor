# AirMonitor

Real-time air quality monitoring dashboard. Receives PM2.5, PM10, temperature, and humidity data from an SDS011 sensor connected to a Raspberry Pi 5 via MQTT. Displays live metrics, historical charts, and AQI gauge with threshold alerts.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (mock data enabled by default)
npm run dev
```

## Features

- Real-time PM2.5, PM10, temperature, and humidity monitoring
- US EPA AQI calculation and radial gauge
- Historical time-series charts (1h / 6h / 24h)
- Configurable alert thresholds with toast notifications
- Dark theme dashboard
- Mock data mode for development without hardware
- 24-hour rolling data persistence

## Raspberry Pi Setup

### Prerequisites

1. Raspberry Pi 5 with SDS011 sensor connected via USB
2. Mosquitto MQTT broker installed:

```bash
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
```

### Publisher Script

```bash
cd pi
pip install sds011lib paho-mqtt
python publisher.py --broker localhost --interval 60
```

CLI options:
- `--broker` — MQTT broker hostname (default: `localhost`)
- `--port` — MQTT broker port (default: `1883`)
- `--topic` — MQTT topic (default: `airmonitor/data`)
- `--interval` — Reading interval in seconds (default: `60`)
- `--serial-port` — SDS011 serial port (default: `/dev/ttyUSB0`)

## Configuration

Click the gear icon in the app header to configure:

- **MQTT Broker URL** — Address of your Mosquitto broker
- **MQTT Topic** — Topic the Pi publishes to
- **Refresh Interval** — How often mock data updates (seconds)
- **Use Mock Data** — Toggle between mock and live MQTT data
- **Alert Thresholds** — PM2.5 and PM10 levels that trigger alerts

## Build

```bash
npm run build
```

## Tech Stack

- Electron 33 + React 18 + TypeScript
- electron-vite for bundling
- Recharts for data visualization
- mqtt.js for MQTT connectivity
- lowdb for local JSON persistence
