# IoT Platform – MQTT → Kafka → NestJS Microservices (EGAT VPPA POC)

## Architecture

```
╔══════════════════════════════════════════════════════════════════╗
║                    OpenADR 2.0b Layer                            ║
║                                                                  ║
║   Utility VTN (EGAT)                                             ║
║         │                                                        ║
║         │  XML: oadrDistributeEvent                              ║
║         │  PUSH → POST /oadr/push                                ║
║         │  PULL → openadr-bridge polls VTN every 30s            ║
║         ▼                                                        ║
║   ┌──────────────────┐                                           ║
║   │  openadr-bridge  │  :4003  converts OpenADR XML → JSON      ║
║   └────────┬─────────┘                                           ║
║            │ produce                                             ║
║            ▼                                                     ║
║   ┌─────────────┐                                                ║
║   │    Kafka    │  port 9092  (topic: iot.dr_events)            ║
║   └──────┬──────┘                                                ║
║          │ consume                                               ║
║      ┌───┴───────────────────┐                                   ║
║      ▼                       ▼                                   ║
║   ┌──────────┐        ┌─────────────┐                            ║
║   │ms-device │        │ms-telemetry │                            ║
║   │  :4001   │        │   :4002     │                            ║
║   └──────────┘        └─────────────┘                            ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔═════════════════════════════════════════════════════════════════╗
║                     MQTT / Kafka Layer                          ║
║                                                                 ║
║   IoT Device (MQTT)                                            ║
║         │  publish: devices/<deviceId>/telemetry               ║
║         │           devices/<deviceId>/events                  ║
║         │  subscribe: devices/<deviceId>/commands              ║
║         │             devices/<deviceId>/ack                   ║
║         ▼                                                      ║
║   ┌─────────────┐                                              ║
║   │    EMQX     │  port 1883 (MQTT) / 8083 (WS) / 18083 (Dashboard) ║
║   └──────┬──────┘                                              ║
║          │ subscribe devices/#                                  ║
║          ▼                                                      ║
║   ┌─────────────┐                                              ║
║   │ mqtt-bridge │  Node.js – forwards messages to Kafka        ║
║   └──────┬──────┘                                              ║
║          │ produce                                              ║
║          ▼                                                      ║
║   ┌─────────────┐                                              ║
║   │    Kafka    │  port 9092  (topics: iot.telemetry, iot.events) ║
║   └──────┬──────┘                                              ║
║          │ consume                                              ║
║      ┌───┴───────────────────┐                                 ║
║      ▼                       ▼                                 ║
║   ┌──────────┐        ┌─────────────┐                          ║
║   │ms-device │        │ms-telemetry │                          ║
║   │  :4001   │        │   :4002     │                          ║
║   └────┬─────┘        └──────┬──────┘                          ║
║        │  publish MQTT        │  publish MQTT                  ║
║        └──────────┬───────────┘                                ║
║                   ▼                                            ║
║   ┌─────────────────────────────────────────────────┐         ║
║   │                    EMQX                         │         ║
║   │  devices/<deviceId>/commands  (ms-device)       │         ║
║   │  devices/<deviceId>/ack       (ms-telemetry)    │         ║
║   └─────────────────────────────────────────────────┘         ║
╚═════════════════════════════════════════════════════════════════╝
```

### OpenADR 2.0b – How openadr-bridge receives signals

openadr-bridge acts as a **VEN (Virtual End Node)** — it only receives inbound DR signals from the upstream utility VTN.

**PUSH** (VTN calls us):
```
Utility VTN  ──POST /oadr/push──▶  openadr-bridge  ──▶  Kafka iot.dr_events
```

**PULL** (we call VTN every 30 s, when `UPSTREAM_VTN_URL` is set):
```
openadr-bridge  ──oadrRequestEvent──▶  Utility VTN
openadr-bridge  ◀──oadrDistributeEvent──  Utility VTN
openadr-bridge  ──▶  Kafka iot.dr_events
```

### SIMPLE signal levels

| Level | Meaning |
|---|---|
| 0 | Normal — no action needed |
| 1 | Low — moderate reduction requested |
| 2 | High — significant reduction requested |
| 3 | Special — emergency / critical curtailment |

---

## Quickstart

```bash
docker compose up --build

# Dashboards
open http://localhost:18083   # EMQX  (admin / public)
open http://localhost:8080    # Kafka UI

# Health checks
curl http://localhost:4001/devices/health
curl http://localhost:4002/telemetry/health
curl http://localhost:4003/oadr/health
```

---

## Simulate IoT Device (MQTT)

```bash
# Publish telemetry
mosquitto_pub -h localhost -p 1883 \
  -t "devices/sensor-001/telemetry" \
  -m '{"temperature":28.5,"humidity":65,"battery":87}'

# Publish event
mosquitto_pub -h localhost -p 1883 \
  -t "devices/sensor-001/events" \
  -m '{"type":"alert","message":"Temperature high"}'

# Trigger auto-alert (temperature > 40°C → ms-device sends MQTT command)
mosquitto_pub -h localhost -p 1883 \
  -t "devices/sensor-001/telemetry" \
  -m '{"temperature":45,"humidity":60,"battery":80}'

# Watch outbound commands / acks
mosquitto_sub -h localhost -p 1883 -t "devices/sensor-001/commands"
mosquitto_sub -h localhost -p 1883 -t "devices/sensor-001/ack"
```

---

## Simulate OpenADR 2.0b DR Signal

### Inject a signal via PUSH (simulates utility VTN calling openadr-bridge)

```bash
curl -X POST http://localhost:4003/oadr/push \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<oadrPayload xmlns:oadr="http://openadr.org/oadr-2.0b/2012/07"
             xmlns:ei="http://docs.oasis-open.org/ns/energyinterop/201110"
             xmlns:xcal="urn:ietf:params:xml:ns:icalendar-2.0"
             xmlns:strm="urn:ietf:params:xml:ns:icalendar-2.0:stream">
  <oadr:oadrSignedObject>
    <oadr:oadrDistributeEvent ei:schemaVersion="2.0b">
      <ei:eiResponse><ei:responseCode>200</ei:responseCode></ei:eiResponse>
      <ei:vtnID>VTN-EGAT</ei:vtnID>
      <ei:eiEvent>
        <ei:eventDescriptor>
          <ei:eventID>EVT-2026-001</ei:eventID>
          <ei:modificationNumber>0</ei:modificationNumber>
          <ei:testEvent>false</ei:testEvent>
          <ei:eventStatus>active</ei:eventStatus>
          <ei:vtnComment>Peak demand reduction</ei:vtnComment>
        </ei:eventDescriptor>
        <ei:eiActivePeriod>
          <xcal:properties>
            <xcal:dtstart><xcal:date-time>2026-06-26T07:00:00Z</xcal:date-time></xcal:dtstart>
            <xcal:duration><xcal:duration>PT2H</xcal:duration></xcal:duration>
          </xcal:properties>
        </ei:eiActivePeriod>
        <ei:eiEventSignals>
          <ei:eiEventSignal>
            <strm:intervals>
              <ei:interval>
                <xcal:uid><xcal:text>0</xcal:text></xcal:uid>
                <xcal:duration><xcal:duration>PT2H</xcal:duration></xcal:duration>
                <ei:signalPayload>
                  <ei:payloadFloat><ei:value>2</ei:value></ei:payloadFloat>
                </ei:signalPayload>
              </ei:interval>
            </strm:intervals>
            <ei:currentValue><ei:payloadFloat><ei:value>2</ei:value></ei:payloadFloat></ei:currentValue>
            <ei:signalID>SIG-001</ei:signalID>
            <ei:signalName>SIMPLE</ei:signalName>
            <ei:signalType>level</ei:signalType>
          </ei:eiEventSignal>
        </ei:eiEventSignals>
        <ei:eiTarget/>
      </ei:eiEvent>
    </oadr:oadrDistributeEvent>
  </oadr:oadrSignedObject>
</oadrPayload>'
```

openadr-bridge will parse the XML, store the event, and publish it to Kafka `iot.dr_events`.

### Check received DR events

```bash
curl http://localhost:4003/oadr/events
```

---

## Kafka Topics

| Topic | Producer | Description |
|---|---|---|
| `iot.telemetry` | mqtt-bridge | Sensor readings |
| `iot.events` | mqtt-bridge | Device alerts / events |
| `iot.dr_events` | openadr-bridge | DR signals received from utility VTN |

## REST Endpoints

| Service | Method | Endpoint | Description |
|---|---|---|---|
| ms-device | GET | `/devices` | List tracked devices |
| ms-device | GET | `/devices/health` | Health check |
| ms-device | POST | `/devices/:id/command` | Send MQTT command to device |
| ms-telemetry | GET | `/telemetry` | Recent records (newest first, max 500) |
| ms-telemetry | GET | `/telemetry/health` | Health check |
| openadr-bridge | POST | `/oadr/push` | Receive DR signal from upstream VTN (PUSH) |
| openadr-bridge | GET | `/oadr/events` | View all received DR events (JSON) |
| openadr-bridge | GET | `/oadr/health` | Health check |

## Environment Variables

| Variable | Default | Used by |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | mqtt-bridge |
| `KAFKA_BROKERS` | `localhost:9092` | all services |
| `KAFKA_TOPIC_TELEMETRY` | `iot.telemetry` | mqtt-bridge, ms-device, ms-telemetry |
| `KAFKA_TOPIC_EVENTS` | `iot.events` | mqtt-bridge, ms-telemetry |
| `KAFKA_TOPIC_DR_EVENTS` | `iot.dr_events` | openadr-bridge |
| `OADR_VEN_ID` | `VEN-EGAT-PLATFORM` | openadr-bridge |
| `UPSTREAM_VTN_URL` | _(empty — PULL disabled)_ | openadr-bridge |

## Next Steps (Production)

- [ ] Replace in-memory store with **PostgreSQL / TimescaleDB**
- [ ] Add **TLS** to OpenADR endpoints (required by OpenADR 2.0b profile B)
- [ ] Add **authentication** to EMQX (username/password or JWT)
- [ ] Enable **Kafka partitioning** by `deviceId`
- [ ] Add **API Gateway** (NestJS gateway + JWT auth)
- [ ] Add **Prometheus + Grafana** for observability
