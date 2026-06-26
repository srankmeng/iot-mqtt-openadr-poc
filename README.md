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
║   ┌──────────────────────────────────────────┐                   ║
║   │           openadr-bridge  :4003          │                   ║
║   │                                          │                   ║
║   │   VEN (upstream client)                  │                   ║
║   │   • polls / receives from Utility VTN    │                   ║
║   │   • converts OpenADR XML → JSON → Kafka  │                   ║
║   │                                          │                   ║
║   │   VTN (downstream server)                │                   ║
║   │   • accepts poll / ACK from field VENs   │                   ║
║   │   • pushes oadrDistributeEvent outbound  │                   ║
║   │   • receives oadrCreatedEvent ACKs       │                   ║
║   └────────┬────────────────────┬────────────┘                   ║
║            │ produce            │ push XML                       ║
║            ▼                    ▼                                ║
║   ┌─────────────┐       Field VEN(s)                             ║
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

---

## OpenADR 2.0b – openadr-bridge as VEN and VTN

`openadr-bridge` runs in **dual role**: it acts as a VEN toward the upstream utility VTN, and as a VTN toward any downstream field VENs.

### Inbound (VEN mode) — receiving DR signals from upstream

**PUSH** (upstream VTN calls us):
```
Utility VTN  ──POST /oadr/push──▶  openadr-bridge  ──▶  Kafka iot.dr_events
```

**PULL** (we poll upstream VTN every 30 s, when `UPSTREAM_VTN_URL` is set):
```
openadr-bridge  ──oadrRequestEvent──▶  Utility VTN
openadr-bridge  ◀──oadrDistributeEvent──  Utility VTN
openadr-bridge  ──▶  Kafka iot.dr_events
```

### Outbound (VTN mode) — distributing DR signals to downstream VENs

**PUSH** (we call each registered VEN):
```
openadr-bridge  ──oadrDistributeEvent──▶  Field VEN
openadr-bridge  ◀──oadrCreatedEvent (ACK)──  Field VEN   (optional)
```

**PULL** (field VEN polls us):
```
Field VEN  ──oadrRequestEvent──▶  POST /vtn/EiEvent
Field VEN  ◀──oadrDistributeEvent──  openadr-bridge
Field VEN  ──oadrCreatedEvent (ACK)──▶  POST /vtn/EiEvent
Field VEN  ◀──oadrResponse──  openadr-bridge
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
curl http://localhost:4003/vtn/health
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

### Inbound: inject a signal via PUSH (simulates upstream utility VTN calling us)

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

openadr-bridge parses the XML, stores the event, and publishes it to Kafka `iot.dr_events`.

```bash
# Check received DR events
curl http://localhost:4003/oadr/events
```

---

### Outbound: send a DR signal to downstream VENs (VTN mode)

**Step 1 — Register a downstream VEN** (its push URL is where we will POST `oadrDistributeEvent`):

```bash
curl -X POST http://localhost:4003/vtn/vens \
  -H "Content-Type: application/json" \
  -d '{"venID": "VEN-SITE-A", "pushUrl": "http://site-a-ven:3000/oadr/push"}'
```

**Step 2 — Distribute an event to all registered VENs** (updates current event state and pushes immediately):

```bash
curl -X POST http://localhost:4003/vtn/events/distribute \
  -H "Content-Type: application/json" \
  -d '{
    "eventID": "EVT-VTN-002",
    "eventStatus": "active",
    "signalName": "SIMPLE",
    "signalLevel": 2,
    "dtstart": "2026-06-26T10:00:00Z",
    "duration": "PT2H",
    "testEvent": false,
    "vtnComment": "Peak demand reduction signal"
  }'
```

**Step 3 — Re-push current event** (without changing it):

```bash
curl -X POST http://localhost:4003/vtn/events/push
```

**Inspect VTN state:**

```bash
# Registered VENs
curl http://localhost:4003/vtn/vens

# Current event being distributed
curl http://localhost:4003/vtn/events/current

# oadrCreatedEvent ACKs received from VENs
curl http://localhost:4003/vtn/acks
```

**Simulate a field VEN polling the VTN** (VEN sends `oadrRequestEvent`, receives `oadrDistributeEvent`):

```bash
curl -X POST http://localhost:4003/vtn/EiEvent \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<oadrPayload xmlns:oadr="http://openadr.org/oadr-2.0b/2012/07"
             xmlns:ei="http://docs.oasis-open.org/ns/energyinterop/201110">
  <oadr:oadrSignedObject>
    <oadr:oadrRequestEvent>
      <ei:eiRequestEvent>
        <requestID xmlns="http://docs.oasis-open.org/ns/energyinterop/201110/payloads">req-001</requestID>
        <ei:venID>VEN-SITE-A</ei:venID>
        <ei:replyLimit>10</ei:replyLimit>
      </ei:eiRequestEvent>
    </oadr:oadrRequestEvent>
  </oadr:oadrSignedObject>
</oadrPayload>'
```

**Simulate a field VEN sending `oadrCreatedEvent` ACK to the VTN** (VTN responds with `oadrResponse`):

```bash
curl -X POST http://localhost:4003/vtn/EiEvent \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<oadrPayload xmlns:oadr="http://openadr.org/oadr-2.0b/2012/07"
             xmlns:ei="http://docs.oasis-open.org/ns/energyinterop/201110">
  <oadr:oadrSignedObject>
    <oadr:oadrCreatedEvent>
      <ei:eiCreatedEvent>
        <ei:venID>VEN-SITE-A</ei:venID>
        <ei:requestID>req-001</ei:requestID>
        <ei:eventResponses>
          <ei:eventResponse>
            <ei:responseCode>200</ei:responseCode>
            <ei:qualifiedEventID>
              <ei:eventID>EVT-VTN-002</ei:eventID>
              <ei:modificationNumber>1</ei:modificationNumber>
            </ei:qualifiedEventID>
            <ei:optType>optIn</ei:optType>
          </ei:eventResponse>
        </ei:eventResponses>
      </ei:eiCreatedEvent>
    </oadr:oadrCreatedEvent>
  </oadr:oadrSignedObject>
</oadrPayload>'
```

---

## Kafka Topics

| Topic | Producer | Description |
|---|---|---|
| `iot.telemetry` | mqtt-bridge | Sensor readings |
| `iot.events` | mqtt-bridge | Device alerts / events |
| `iot.dr_events` | openadr-bridge | DR signals received from upstream utility VTN |

## REST Endpoints

| Service | Method | Endpoint | Description |
|---|---|---|---|
| ms-device | GET | `/devices` | List tracked devices |
| ms-device | GET | `/devices/health` | Health check |
| ms-device | POST | `/devices/:id/command` | Send MQTT command to device |
| ms-telemetry | GET | `/telemetry` | Recent records (newest first, max 500) |
| ms-telemetry | GET | `/telemetry/health` | Health check |
| openadr-bridge | POST | `/oadr/push` | **VEN** — receive DR signal from upstream VTN (PUSH) |
| openadr-bridge | GET | `/oadr/events` | **VEN** — view all received DR events (JSON) |
| openadr-bridge | GET | `/oadr/health` | Health check |
| openadr-bridge | POST | `/vtn/EiEvent` | **VTN** — field VEN polls (`oadrRequestEvent`) or sends ACK (`oadrCreatedEvent`) |
| openadr-bridge | POST | `/vtn/vens` | **VTN** — register a downstream VEN `{venID, pushUrl}` |
| openadr-bridge | GET | `/vtn/vens` | **VTN** — list registered downstream VENs |
| openadr-bridge | POST | `/vtn/events/distribute` | **VTN** — update current event and push to all VENs |
| openadr-bridge | POST | `/vtn/events/push` | **VTN** — re-push current event to all VENs |
| openadr-bridge | GET | `/vtn/events/current` | **VTN** — inspect current event state |
| openadr-bridge | GET | `/vtn/acks` | **VTN** — view `oadrCreatedEvent` ACKs received from VENs |
| openadr-bridge | GET | `/vtn/health` | **VTN** — health check |

## Environment Variables

| Variable | Default | Used by |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | mqtt-bridge |
| `KAFKA_BROKERS` | `localhost:9092` | all services |
| `KAFKA_TOPIC_TELEMETRY` | `iot.telemetry` | mqtt-bridge, ms-device, ms-telemetry |
| `KAFKA_TOPIC_EVENTS` | `iot.events` | mqtt-bridge, ms-telemetry |
| `KAFKA_TOPIC_DR_EVENTS` | `iot.dr_events` | openadr-bridge |
| `OADR_VEN_ID` | `VEN-EGAT-PLATFORM` | openadr-bridge (VEN mode) |
| `OADR_VTN_ID` | `VTN-EGAT-PLATFORM` | openadr-bridge (VTN mode) |
| `UPSTREAM_VTN_URL` | _(empty — PULL disabled)_ | openadr-bridge (VEN mode) |

---

## Mock VEN — simulate a downstream field VEN

`mock-ven/` is a minimal Express service that acts as an OpenADR VEN for local testing. It receives pushed events, sends `oadrCreatedEvent` ACKs, and can poll the VTN on demand.

### Start it

Uncomment `mock-ven` in `docker-compose.yml`, then:

```bash
docker compose up --build mock-ven
```

Or run standalone (pointing at openadr-bridge on the host):

```bash
cd mock-ven
npm install
VEN_ID=VEN-MOCK-001 VTN_URL=http://localhost:4003 node index.js
# listening on :3000
```

### Register it with the VTN

```bash
curl -X POST http://localhost:4003/vtn/vens \
  -H "Content-Type: application/json" \
  -d '{"venID": "VEN-MOCK-001", "pushUrl": "http://localhost:3000/oadr/push"}'
```

When running via Docker Compose, use the internal hostname:

```bash
curl -X POST http://localhost:4003/vtn/vens \
  -H "Content-Type: application/json" \
  -d '{"venID": "VEN-MOCK-001", "pushUrl": "http://mock-ven:3000/oadr/push"}'
```

### Simulate a PUSH (VTN → VEN)

Trigger the VTN to push the current event to all registered VENs:

```bash
curl -X POST http://localhost:4003/vtn/events/push
```

The mock-ven receives `oadrDistributeEvent`, stores it, and responds inline with `oadrCreatedEvent` (optIn). Confirm in mock-ven logs and via:

```bash
curl http://localhost:3000/admin/events   # events received by the mock VEN
curl http://localhost:4003/vtn/acks       # ACKs received by the VTN
```

### Simulate a PULL (VEN polls VTN)

The mock-ven polls the VTN's `/vtn/EiEvent` endpoint, then sends back `oadrCreatedEvent`:

```bash
curl -X POST http://localhost:3000/admin/poll
```

### Change optIn / optOut on the fly

```bash
curl -X PUT http://localhost:3000/admin/opttype \
  -H "Content-Type: application/json" \
  -d '{"optType": "optOut"}'
```

### Mock VEN endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/oadr/push` | Receive `oadrDistributeEvent` from VTN; responds with `oadrCreatedEvent` |
| `POST` | `/admin/poll` | Poll VTN for events and send ACK |
| `GET` | `/admin/events` | View all received DR events |
| `DELETE` | `/admin/events` | Clear stored events |
| `PUT` | `/admin/opttype` | Switch response between `optIn` and `optOut` |
| `GET` | `/health` | Health check |

### Mock VEN environment variables

| Variable | Default | Description |
|---|---|---|
| `VEN_ID` | `VEN-MOCK-001` | VEN identity sent in ACK messages |
| `VTN_URL` | `http://localhost:4003` | Base URL of the VTN (`/vtn/EiEvent` is appended) |
| `OPT_TYPE` | `optIn` | Default ACK response (`optIn` or `optOut`) |
| `PORT` | `3000` | HTTP port |

---

## Next Steps (Production)

- [ ] Replace in-memory store with **PostgreSQL / TimescaleDB**
- [ ] Add **TLS** to OpenADR endpoints (required by OpenADR 2.0b profile B)
- [ ] Add **authentication** to EMQX (username/password or JWT)
- [ ] Enable **Kafka partitioning** by `deviceId`
- [ ] Add **API Gateway** (NestJS gateway + JWT auth)
- [ ] Add **Prometheus + Grafana** for observability
