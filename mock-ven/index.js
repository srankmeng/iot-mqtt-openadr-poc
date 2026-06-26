'use strict';

const express = require('express');
const axios   = require('axios');
const { XMLParser } = require('fast-xml-parser');

const app = express();
app.use(express.text({ type: ['application/xml', 'text/xml', '*/*'] }));
app.use(express.json());

const PORT    = process.env.PORT    || 3000;
const VEN_ID  = process.env.VEN_ID  || 'VEN-MOCK-001';
const VTN_URL = process.env.VTN_URL || 'http://localhost:4003';   // openadr-bridge VTN endpoint
const OPT_TYPE = process.env.OPT_TYPE || 'optIn';                  // optIn | optOut

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: true });

const OADR_NS = `xmlns:oadr="http://openadr.org/oadr-2.0b/2012/07"
             xmlns:ei="http://docs.oasis-open.org/ns/energyinterop/201110"
             xmlns:xcal="urn:ietf:params:xml:ns:icalendar-2.0"
             xmlns:strm="urn:ietf:params:xml:ns:icalendar-2.0:stream"`;

let reqCounter = 0;
const receivedEvents = [];

// ── Parse an oadrDistributeEvent object and return a flat event list ──────────
function extractEvents(distributeEvent) {
  const raw = distributeEvent?.eiEvent ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((e) => {
    const desc   = e?.eventDescriptor ?? {};
    const period = e?.eiActivePeriod?.properties ?? {};
    const sig    = e?.eiEventSignals?.eiEventSignal ?? {};
    const s      = Array.isArray(sig) ? sig[0] : sig;
    return {
      eventID:            String(desc.eventID ?? ''),
      modificationNumber: Number(desc.modificationNumber ?? 0),
      eventStatus:        desc.eventStatus ?? 'none',
      signalName:         s?.signalName ?? 'SIMPLE',
      signalLevel:        Number(s?.currentValue?.payloadFloat?.value ?? s?.currentValue ?? 0),
      dtstart:            period?.dtstart?.['date-time'] ?? period?.dtstart ?? '',
      duration:           period?.duration?.duration ?? period?.duration ?? '',
      testEvent:          String(desc.testEvent) === 'true',
      vtnComment:         desc.vtnComment ?? '',
      receivedAt:         new Date().toISOString(),
    };
  });
}

// ── Build oadrCreatedEvent — sent to VTN after receiving oadrDistributeEvent ──
function buildCreatedEvent(requestID, events) {
  const responses = events.map((e) => `
          <ei:eventResponse>
            <ei:responseCode>200</ei:responseCode>
            <ei:requestID>${requestID}</ei:requestID>
            <ei:qualifiedEventID>
              <ei:eventID>${e.eventID}</ei:eventID>
              <ei:modificationNumber>${e.modificationNumber}</ei:modificationNumber>
            </ei:qualifiedEventID>
            <ei:optType>${OPT_TYPE}</ei:optType>
          </ei:eventResponse>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<oadr:oadrPayload ${OADR_NS}>
  <oadr:oadrSignedObject>
    <oadr:oadrCreatedEvent>
      <ei:eiCreatedEvent>
        <ei:venID>${VEN_ID}</ei:venID>
        <ei:requestID>${requestID}</ei:requestID>
        <ei:eventResponses>${responses}
        </ei:eventResponses>
      </ei:eiCreatedEvent>
    </oadr:oadrCreatedEvent>
  </oadr:oadrSignedObject>
</oadr:oadrPayload>`;
}

// ── Build oadrRequestEvent — VEN polls VTN for events ────────────────────────
function buildRequestEvent(requestID) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<oadrPayload ${OADR_NS}>
  <oadr:oadrSignedObject>
    <oadr:oadrRequestEvent>
      <ei:eiRequestEvent>
        <requestID xmlns="http://docs.oasis-open.org/ns/energyinterop/201110/payloads">${requestID}</requestID>
        <ei:venID>${VEN_ID}</ei:venID>
        <ei:replyLimit>10</ei:replyLimit>
      </ei:eiRequestEvent>
    </oadr:oadrRequestEvent>
  </oadr:oadrSignedObject>
</oadrPayload>`;
}

// ── PUSH: VTN sends oadrDistributeEvent to us ─────────────────────────────────
app.post('/oadr/push', (req, res) => {
  const xmlBody = typeof req.body === 'string' ? req.body : '';
  console.log('[VEN] Received PUSH from VTN');

  try {
    const obj    = parser.parse(xmlBody);
    const signed = obj?.oadrPayload?.oadrSignedObject ?? obj?.oadrSignedObject ?? {};
    const dist   = signed?.oadrDistributeEvent;

    if (!dist) {
      console.warn('[VEN] PUSH body did not contain oadrDistributeEvent');
      return res.status(400).send('Expected oadrDistributeEvent');
    }

    const vtnRequestID = String(dist?.requestID ?? `req-push-${Date.now()}`);
    const events = extractEvents(dist);
    events.forEach((e) => receivedEvents.push(e));
    console.log(`[VEN] Stored ${events.length} event(s): ${events.map((e) => e.eventID).join(', ')}`);

    // Respond inline with oadrCreatedEvent (optIn/optOut per OPT_TYPE)
    const ack = buildCreatedEvent(vtnRequestID, events);
    res.set('Content-Type', 'application/xml').send(ack);
    console.log(`[VEN] Sent oadrCreatedEvent (${OPT_TYPE}) back to VTN`);
  } catch (err) {
    console.error('[VEN] Failed to parse PUSH body:', err.message);
    res.status(500).send('Parse error');
  }
});

// ── POLL: admin triggers VEN to poll VTN ──────────────────────────────────────
app.post('/admin/poll', async (req, res) => {
  const requestID = `ven-poll-${Date.now()}-${++reqCounter}`;
  const body = buildRequestEvent(requestID);
  const url  = `${VTN_URL}/vtn/EiEvent`;
  console.log(`[VEN] Polling VTN at ${url}`);

  try {
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 10000,
    });

    const obj    = parser.parse(response.data);
    const signed = obj?.oadrPayload?.oadrSignedObject ?? obj?.oadrSignedObject ?? {};
    const dist   = signed?.oadrDistributeEvent;

    if (!dist) {
      console.warn('[VEN] Poll response did not contain oadrDistributeEvent');
      return res.json({ ok: false, message: 'No oadrDistributeEvent in response', raw: response.data });
    }

    const events = extractEvents(dist);
    events.forEach((e) => receivedEvents.push(e));
    console.log(`[VEN] Poll returned ${events.length} event(s): ${events.map((e) => e.eventID).join(', ')}`);

    // Send oadrCreatedEvent ACK back to VTN
    const ack = buildCreatedEvent(requestID, events);
    await axios.post(url, ack, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 10000,
    });
    console.log(`[VEN] Sent oadrCreatedEvent ACK to VTN`);

    res.json({ ok: true, eventsReceived: events });
  } catch (err) {
    console.error('[VEN] Poll failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Admin: view received events ───────────────────────────────────────────────
app.get('/admin/events', (req, res) => res.json(receivedEvents));

// ── Admin: clear stored events ────────────────────────────────────────────────
app.delete('/admin/events', (req, res) => {
  receivedEvents.length = 0;
  res.json({ ok: true });
});

// ── Admin: change opt type on the fly ────────────────────────────────────────
// PUT /admin/opttype  { "optType": "optOut" }
let dynamicOptType = OPT_TYPE;
app.put('/admin/opttype', (req, res) => {
  const { optType } = req.body;
  if (!['optIn', 'optOut'].includes(optType)) {
    return res.status(400).json({ error: 'optType must be optIn or optOut' });
  }
  dynamicOptType = optType;
  console.log(`[VEN] optType changed to: ${dynamicOptType}`);
  res.json({ ok: true, optType: dynamicOptType });
});

app.get('/health', (req, res) =>
  res.json({
    status: 'ok',
    service: 'mock-ven',
    venID: VEN_ID,
    vtnUrl: VTN_URL,
    optType: dynamicOptType,
    eventsReceived: receivedEvents.length,
    ts: new Date().toISOString(),
  }),
);

app.listen(PORT, () => {
  console.log(`[VEN] Mock VEN (${VEN_ID}) listening on port ${PORT}`);
  console.log(`[VEN] POST /oadr/push        — VTN pushes oadrDistributeEvent here`);
  console.log(`[VEN] POST /admin/poll       — trigger poll to VTN (${VTN_URL}/vtn/EiEvent)`);
  console.log(`[VEN] GET  /admin/events     — view received events`);
  console.log(`[VEN] DELETE /admin/events   — clear stored events`);
  console.log(`[VEN] PUT  /admin/opttype    — change optIn/optOut response`);
  console.log(`[VEN] GET  /health           — health check`);
});
