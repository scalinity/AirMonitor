#!/usr/bin/env python3
"""
AirMonitor — Raspberry Pi MQTT Publisher
Reads SDS011 air quality sensor and publishes data via MQTT.
Supports both query mode (interval-based) and continuous mode
(active reporting ~1 reading/second).

Requirements:
    pip install sds011lib paho-mqtt

Usage:
    python publisher.py --broker raspberrypi.local --port 1883 --interval 30
    python publisher.py --broker raspberrypi.local --continuous
"""

import argparse
import json
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


continuous_mode = False
reading_interval = 60
mode_lock = threading.Lock()
port_lock = threading.Lock()


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


def build_payload(pm25: float, pm10: float) -> dict:
    """Build a sensor reading payload."""
    return {
        "timestamp": int(time.time() * 1000),
        "pm25": pm25,
        "pm10": pm10,
        "temperature": 0,
        "humidity": 0,
        "aqi": pm25_to_aqi(pm25),
    }


def publish_reading(client: mqtt.Client, topic: str, data: dict) -> None:
    """Publish a reading to MQTT."""
    client.publish(topic, json.dumps(data))
    print(f"Published: PM2.5={data['pm25']}, PM10={data['pm10']}, AQI={data['aqi']}")


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
                time.sleep(30)
            else:
                time.sleep(1)
            result = reader.query()
            return result.pm25, result.pm10
        finally:
            try:
                reader.sleep()
            except Exception:
                pass


def on_command(client: mqtt.Client, userdata: dict, message: mqtt.MQTTMessage) -> None:
    """Handle commands from the desktop app."""
    global continuous_mode, reading_interval

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
    global continuous_mode, reading_interval

    parser = argparse.ArgumentParser(description="AirMonitor MQTT Publisher")
    parser.add_argument("--broker", default="localhost", help="MQTT broker hostname")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--topic", default="airmonitor/data", help="MQTT topic")
    parser.add_argument("--command-topic", default="airmonitor/command", help="MQTT command topic")
    parser.add_argument("--interval", type=int, default=60, help="Reading interval in seconds (query mode)")
    parser.add_argument("--serial-port", default="/dev/ttyUSB0", help="SDS011 serial port")
    parser.add_argument("--continuous", action="store_true", help="Start in continuous mode")
    args = parser.parse_args()

    reading_interval = args.interval
    if args.continuous:
        continuous_mode = True

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

        while True:
            with mode_lock:
                is_continuous = continuous_mode
                interval = reading_interval

            if is_continuous:
                # Continuous: read as fast as possible (no warmup, ~1s cycle)
                try:
                    pm25, pm10 = read_sensor(args.serial_port, warmup=False)
                    publish_reading(client, args.topic, build_payload(pm25, pm10))
                except Exception as e:
                    print(f"Sensor read error: {e}")
                    time.sleep(1)
            else:
                # Query mode: read with warmup, then sleep for interval
                try:
                    pm25, pm10 = read_sensor(args.serial_port, warmup=True)
                    publish_reading(client, args.topic, build_payload(pm25, pm10))
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


if __name__ == "__main__":
    main()
