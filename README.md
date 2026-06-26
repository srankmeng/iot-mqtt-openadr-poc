# IoT Platform – MQTT → Kafka → NestJS Microservices

## Architecture

```
IoT Device (MQTT)
      │  publish: devices/<deviceId>/telemetry
      │           devices/<deviceId>/events
      │  subscribe: devices/<deviceId>/commands
      │             devices/<deviceId>/ack
      ▼
┌─────────────┐
│    EMQX     │  port 1883 (MQTT) / 8083 (WS) / 18083 (Dashboard)
└──────┬──────┘
       │ subscribe devices/#
       ▼
┌─────────────┐
│ mqtt-bridge │  Node.js – forwards messages to Kafka
└──────┬──────┘
       │ produce
       ▼
┌─────────────┐
│    Kafka    │  port 9092  (topics: iot.telemetry, iot.events)
└──────┬──────┘
       │ consume
   ┌───┴───────────────────┐
   ▼                       ▼
┌──────────┐        ┌─────────────┐
│ms-device │        │ms-telemetry │
│ :4001    │        │ :4002       │
└────┬─────┘        └──────┬──────┘
     │  publish MQTT        │  publish MQTT
     └──────────┬───────────┘
                ▼
┌─────────────────────────────────────────────────┐
│                    EMQX                         │
│  devices/<deviceId>/commands  (ms-device)       │
│  devices/<deviceId>/ack       (ms-telemetry)    │
└─────────────────────────────────────────────────┘
```

## Quickstart

```bash
# 1. Clone / enter directory
cd iot-platform

# 2. Start everything
docker compose up --build

# 3. EMQX Dashboard
open http://localhost:18083   # admin / public

# 4. Kafka UI
open http://localhost:8080

# 5. Check microservice health
curl http://localhost:4001/devices/health
curl http://localhost:4002/telemetry/health
```

## Simulate IoT device

Use any MQTT client. Examples below use `mosquitto_pub`:

```bash
# Install mosquitto client
brew install mosquitto        # macOS
apt install mosquitto-clients # Ubuntu

# Publish telemetry
mosquitto_pub -h localhost -p 1883 \
  -t "devices/sensor-001/telemetry" \
  -m '{"temperature":28.5,"humidity":65,"battery":87}'

# Publish event
mosquitto_pub -h localhost -p 1883 \
  -t "devices/sensor-001/events" \
  -m '{"type":"alert","message":"Temperature high"}'
```

## Kafka Topics

| Topic           | Description                        |
|-----------------|------------------------------------|
| `iot.telemetry` | Sensor readings (temp, humidity …) |
| `iot.events`    | Device events / alerts             |

## MQTT Topic Convention

### Device → Broker (inbound)

| Topic | Forwarded to Kafka |
|---|---|
| `devices/<deviceId>/telemetry` | `iot.telemetry` |
| `devices/<deviceId>/events` | `iot.events` |

### Broker → Device (outbound, published by microservices)

| Topic | Published by | Trigger |
|---|---|---|
| `devices/<deviceId>/commands` | `ms-device` | Auto: temperature > 40°C; or manual via REST |
| `devices/<deviceId>/ack` | `ms-telemetry` | Every stored telemetry or event record |

Subscribe to see messages coming back to a device:

```bash
# Watch for commands sent to sensor-001
mosquitto_sub -h localhost -p 1883 -t "devices/sensor-001/commands"

# Watch for acks from ms-telemetry
mosquitto_sub -h localhost -p 1883 -t "devices/sensor-001/ack"
```

Trigger the auto-alert (temperature > 40°C):

```bash
mosquitto_pub -h localhost -p 1883 \
  -t "devices/sensor-001/telemetry" \
  -m '{"temperature":45,"humidity":60,"battery":80}'
# → ms-device publishes {"action":"alert","reason":"high_temperature","value":45} to devices/sensor-001/commands
```

## REST Endpoints

| Service | Method | Endpoint | Description |
|---|---|---|---|
| ms-device | GET | `/devices` | List tracked devices |
| ms-device | GET | `/devices/health` | Health check |
| ms-device | POST | `/devices/:id/command` | Send a command to a device via MQTT |
| ms-telemetry | GET | `/telemetry` | Recent telemetry/events (newest first, max 500) |
| ms-telemetry | GET | `/telemetry/health` | Health check |

Send a manual command to a device:

```bash
curl -X POST http://localhost:4001/devices/sensor-001/command \
  -H "Content-Type: application/json" \
  -d '{"action":"reboot","reason":"manual"}'
```

## Next Steps (Production)

- [ ] Replace in-memory store with **PostgreSQL / TimescaleDB** (telemetry) or **MongoDB** (events)
- [ ] Add **authentication** to EMQX (username/password or JWT)
- [ ] Enable **Kafka partitioning** by `deviceId` for ordered processing
- [ ] Add **API Gateway** (e.g. NestJS gateway + JWT auth)
- [ ] Add **Prometheus + Grafana** for observability
