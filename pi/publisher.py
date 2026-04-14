#!/usr/bin/env python3
"""
AirMonitor — Raspberry Pi MQTT Publisher
Reads SDS011 air quality sensor and DHT11 temperature/humidity sensor,
then publishes data via MQTT.
Supports both query mode (interval-based) and continuous mode
(active reporting ~1 reading/second).

Requirements:
    pip install sds011lib paho-mqtt adafruit-circuitpython-dht

Usage:
    python publisher.py --broker raspberrypi.local --port 1883 --interval 30
    python publisher.py --broker raspberrypi.local --continuous
"""

import argparse
import json
import os
import re as re_mod
import sqlite3
import threading
import time
import sys

try:
    from sds011lib import SDS011QueryReader
except ImportError:
    SDS011QueryReader = None

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Error: paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)

try:
    import board
    import adafruit_dht
except Exception:
    adafruit_dht = None
    board = None


DB_PATH = "/home/danny/airmonitor.db"

SDS011_WARMUP_SECONDS = 30
DHT_MAX_RETRIES = 3
DHT_RETRY_DELAY = 0.5
DHT_READ_EVERY_N = 10

continuous_mode = False
reading_interval = 60
mode_lock = threading.Lock()
port_lock = threading.Lock()

dht_device = None
last_temperature = None
last_humidity = None


def init_db() -> sqlite3.Connection:
    """Open SQLite connection for direct persistence (backup for MQTT logger)."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER UNIQUE,
                pm25 REAL,
                pm10 REAL,
                aqi INTEGER,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        # Migrate: add temperature/humidity columns if they don't exist
        existing = {row[1] for row in conn.execute("PRAGMA table_info(readings)").fetchall()}
        if "temperature" not in existing:
            conn.execute("ALTER TABLE readings ADD COLUMN temperature REAL DEFAULT 0")
        if "humidity" not in existing:
            conn.execute("ALTER TABLE readings ADD COLUMN humidity REAL DEFAULT 0")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON readings(timestamp)")
        conn.commit()
    except Exception:
        conn.close()
        raise
    return conn


def write_reading(conn: sqlite3.Connection, data: dict) -> None:
    """Persist reading directly to SQLite. Non-fatal on error."""
    try:
        conn.execute(
            "INSERT OR IGNORE INTO readings (timestamp, pm25, pm10, aqi, temperature, humidity) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (data["timestamp"], data["pm25"], data["pm10"], data["aqi"],
             data["temperature"], data["humidity"]),
        )
        conn.commit()
    except Exception as e:
        print(f"DB write error (non-fatal): {e}")


def pm25_to_aqi(pm25: float) -> int:
    """Convert PM2.5 concentration to US EPA AQI."""
    truncated = int(pm25 * 10) / 10
    breakpoints = [
        (0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 500.4, 301, 500),
    ]
    for c_low, c_high, i_low, i_high in breakpoints:
        if c_low <= truncated <= c_high:
            return round((i_high - i_low) / (c_high - c_low) * (truncated - c_low) + i_low)
    return 500 if truncated > 500.4 else 0


def build_payload(pm25: float, pm10: float, temperature: float, humidity: float) -> dict:
    """Build a sensor reading payload."""
    return {
        "timestamp": int(time.time() * 1000),
        "pm25": pm25,
        "pm10": pm10,
        "temperature": temperature,
        "humidity": humidity,
        "aqi": pm25_to_aqi(pm25),
    }


def publish_reading(client: mqtt.Client, topic: str, data: dict) -> None:
    """Publish a reading to MQTT."""
    client.publish(topic, json.dumps(data))
    print(f"Published: PM2.5={data['pm25']}, PM10={data['pm10']}, AQI={data['aqi']}, "
          f"Temp={data['temperature']}°C, Humidity={data['humidity']}%")


def read_sensor(serial_port: str, warmup: bool = True) -> tuple[float, float]:
    """Take a single reading from the SDS011 using query mode.
    Returns (pm25, pm10). Uses port_lock to prevent concurrent access."""
    if SDS011QueryReader is None:
        import random
        return round(random.uniform(5, 50), 1), round(random.uniform(10, 80), 1)

    with port_lock:
        reader = SDS011QueryReader(serial_port)
        try:
            reader.wake()
            if warmup:
                time.sleep(SDS011_WARMUP_SECONDS)
            else:
                time.sleep(1)
            result = reader.query()
            return result.pm25, result.pm10
        finally:
            try:
                reader.sleep()
            except Exception:
                pass


def read_dht() -> tuple[float, float]:
    """Read temperature and humidity from DHT11.
    Returns (temperature_c, humidity_percent).
    Falls back to last known values on failure, or (0, 0) if never read."""
    global last_temperature, last_humidity

    if dht_device is None:
        if SDS011QueryReader is None:
            # Full mock mode — generate random values for dev testing
            import random
            return (round(random.uniform(18, 30), 1), round(random.uniform(35, 75), 1))
        return (last_temperature if last_temperature is not None else 0,
                last_humidity if last_humidity is not None else 0)

    for _ in range(DHT_MAX_RETRIES):
        try:
            temperature = dht_device.temperature
            humidity = dht_device.humidity
            if temperature is not None and humidity is not None:
                # DHT11 sometimes returns 0/0 on failed reads — treat as bad data
                if temperature == 0 and humidity == 0:
                    continue
                last_temperature = float(temperature)
                last_humidity = float(humidity)
                return (last_temperature, last_humidity)
        except RuntimeError:
            # DHT11 frequently throws RuntimeError on bad reads
            time.sleep(DHT_RETRY_DELAY)
        except Exception as e:
            print(f"DHT11 error: {e}")
            break

    # All retries failed — return last known or zeros
    return (last_temperature if last_temperature is not None else 0,
            last_humidity if last_humidity is not None else 0)


def on_command(client: mqtt.Client, userdata: dict, message: mqtt.MQTTMessage) -> None:
    """Handle commands from the desktop app."""
    global continuous_mode, reading_interval

    # Limit payload size to prevent memory exhaustion from oversized messages
    if len(message.payload) > 1024:
        return

    try:
        cmd = json.loads(message.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    if cmd.get("command") == "set_continuous":
        enabled = bool(cmd.get("enabled", False))
        with mode_lock:
            continuous_mode = enabled
        print(f"Continuous mode {'ENABLED' if enabled else 'DISABLED'} by app")

    elif cmd.get("command") == "set_interval":
        new_interval = cmd.get("interval")
        if isinstance(new_interval, (int, float)) and 1 <= new_interval <= 3600:
            with mode_lock:
                reading_interval = int(new_interval)
                if continuous_mode:
                    continuous_mode = False
                    print("Continuous mode DISABLED — switching to interval mode")
            print(f"Reading interval changed to {reading_interval}s by app")


def main():
    global continuous_mode, reading_interval, dht_device

    parser = argparse.ArgumentParser(description="AirMonitor MQTT Publisher")
    parser.add_argument("--broker", default="localhost", help="MQTT broker hostname")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--topic", default="airmonitor/data", help="MQTT topic")
    parser.add_argument("--command-topic", default="airmonitor/command", help="MQTT command topic")
    parser.add_argument("--interval", type=int, default=60, help="Reading interval in seconds (query mode)")
    parser.add_argument("--serial-port", default="/dev/ttyUSB0", help="SDS011 serial port")
    parser.add_argument("--continuous", action="store_true", help="Start in continuous mode")
    parser.add_argument("--dht-pin", default="D17", help="DHT11 GPIO pin (board name, e.g. D4, D17)")
    args = parser.parse_args()

    reading_interval = args.interval
    if args.continuous:
        continuous_mode = True

    # Initialize DHT11 sensor
    if adafruit_dht is not None and board is not None:
        try:
            if not re_mod.match(r'^D\d+$', args.dht_pin):
                raise ValueError(f"Invalid pin name '{args.dht_pin}' — expected format: D4, D17, etc.")
            pin = getattr(board, args.dht_pin)
            dht_device = adafruit_dht.DHT11(pin, use_pulseio=False)
            print(f"DHT11 initialized on pin {args.dht_pin}")
        except Exception as e:
            print(f"DHT11 init failed (continuing without): {e}")
            dht_device = None
    else:
        print("DHT11 library not available — temperature/humidity will be 0")

    db = init_db()
    os.chmod(DB_PATH, 0o600)
    print(f"SQLite backup enabled: {DB_PATH}")

    userdata = {"topic": args.topic, "serial_port": args.serial_port}
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, userdata=userdata)
    client.on_message = on_command

    try:
        client.connect(args.broker, args.port)
        client.subscribe(args.command_topic)
        client.loop_start()
        print(f"Connected to MQTT broker at {args.broker}:{args.port}")
        print(f"Publishing to topic: {args.topic}")
        print(f"Listening for commands on: {args.command_topic}")

        dht_counter = 0

        while True:
            with mode_lock:
                is_continuous = continuous_mode
                interval = reading_interval

            if is_continuous:
                # Continuous: read as fast as possible (no warmup, ~1s cycle)
                try:
                    pm25, pm10 = read_sensor(args.serial_port, warmup=False)
                    dht_counter += 1
                    if dht_counter % DHT_READ_EVERY_N == 0 or last_temperature is None:
                        temperature, humidity = read_dht()
                    else:
                        temperature = last_temperature if last_temperature is not None else 0
                        humidity = last_humidity if last_humidity is not None else 0
                    data = build_payload(pm25, pm10, temperature, humidity)
                    publish_reading(client, args.topic, data)
                    write_reading(db, data)
                except Exception as e:
                    print(f"Sensor read error: {e}")
                    time.sleep(1)
            else:
                # Query mode: read with warmup, then sleep for interval
                try:
                    pm25, pm10 = read_sensor(args.serial_port, warmup=True)
                    temperature, humidity = read_dht()
                    data = build_payload(pm25, pm10, temperature, humidity)
                    publish_reading(client, args.topic, data)
                    write_reading(db, data)
                except Exception as e:
                    print(f"Sensor read error: {e}")

                # Sleep in 1s increments to react to mode/interval changes
                for _ in range(interval):
                    with mode_lock:
                        if continuous_mode or reading_interval != interval:
                            break
                    time.sleep(1)

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        with mode_lock:
            continuous_mode = False
        client.loop_stop()
        client.disconnect()
        db.close()
        if dht_device is not None:
            try:
                dht_device.exit()
            except Exception:
                pass


if __name__ == "__main__":
    main()
