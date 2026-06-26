# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IoT platform POC (EGAT VPPA) using MQTT → Kafka → NestJS microservices. All services run via Docker Compose; there is no monorepo tooling — each service is its own Node.js project.

## Commands

### Run everything
```bash
docker compose up --build
```

### Develop a microservice locally (from its directory)
```bash
cd ms-device       # or ms-telemetry
npm install
npm run start:dev  # watch mode via NestJS CLI
```

### Build a microservice
```bash
npm run build      # emits to dist/
```

### Verify services are up
```bash
curl http://localhost:4001/devices/health
curl http://localhost:4002/telemetry/health
```

### Simulate an IoT device
```bash
mosquitto_pub -h localhost -p 1883 -t "devices/sensor-001/telemetry" \
  -m '{"temperature":28.5,"humidity":65,"battery":87}'

mosquitto_pub -h localhost -p 1883 -t "devices/sensor-001/events" \
  -m '{"type":"alert","message":"Temperature high"}'
```

## Architecture

```
IoT Device (MQTT pub)
      ↓  topic: devices/<deviceId>/telemetry|events
   EMQX (port 1883 / dashboard 18083, admin/public)
      ↓  subscribe devices/#
  mqtt-bridge  (Node.js, plain JS)
      ↓  produce
   Kafka KRaft (port 9092 / UI 8080)
      ↓  topics: iot.telemetry, iot.events
   ┌──────────────┬──────────────────┐
ms-device :4001    ms-telemetry :4002
```

**mqtt-bridge** (`mqtt-bridge/index.js`) — stateless Node.js process. Receives every MQTT message on `devices/#`, wraps it in `{ deviceId, mqttTopic, timestamp, payload }`, and produces to either `iot.telemetry` or `iot.events` based on the trailing path segment.

**ms-device** (`ms-device/`) — NestJS app that runs *both* an HTTP server and a Kafka consumer in the same process (`app.connectMicroservice` + `app.listen`). Consumes `iot.telemetry` and maintains an in-memory `Map<deviceId, DeviceRecord>` (last-seen + last payload). REST: `GET /devices`.

**ms-telemetry** (`ms-telemetry/`) — Same dual HTTP+Kafka pattern. Consumes both `iot.telemetry` and `iot.events`, stores up to 500 records in a ring buffer array. REST: `GET /telemetry` (newest first).

### NestJS Kafka wiring pattern (used by both microservices)

`@MessagePattern(topicName)` in the controller acts as the Kafka consumer handler. The topic name is read from env at startup via `process.env.KAFKA_TOPIC_*`. The microservice transport is wired in `main.ts` using `Transport.KAFKA` before `app.listen()`.

### In-memory storage

Both services store data in memory only — restarting a container clears all data. The intended production replacements are noted in the service files: TypeORM/Prisma + PostgreSQL for devices, TimescaleDB/InfluxDB for telemetry.

## Environment Variables

| Variable | Default | Used by |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | mqtt-bridge |
| `MQTT_TOPICS` | `devices/#` | mqtt-bridge |
| `KAFKA_BROKERS` | `localhost:9092` | all services |
| `KAFKA_TOPIC_TELEMETRY` | `iot.telemetry` | mqtt-bridge, ms-device, ms-telemetry |
| `KAFKA_TOPIC_EVENTS` | `iot.events` | mqtt-bridge, ms-telemetry |
| `KAFKA_GROUP_ID` | service-specific | ms-device, ms-telemetry |

Internal Docker network uses `kafka:29092`; the host-accessible port is `9092`.
