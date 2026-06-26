'use strict';

const express = require('express');
const app = express();

app.use(express.text({ type: ['application/xml', 'text/xml', '*/*'] }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── Current event state (can be overridden via admin API) ──────────────────
let currentEvent = {
  eventID: 'EVT-MOCK-001',
  modificationNumber: 0,
  eventStatus: 'active',      // none | far | near | active | completed | cancelled
  dtstart: new Date().toISOString(),
  duration: 'PT1H',
  signalName: 'SIMPLE',       // SIMPLE | LOAD_DISPATCH | ELECTRICITY_PRICE
  signalLevel: 2,             // 0=normal 1=low 2=high 3=special
  testEvent: true,
  vtnComment: 'Mock VTN test event',
};

function buildDistributeEvent() {
  const e = currentEvent;
  return `<?xml version="1.0" encoding="UTF-8"?>
<oadr:oadrPayload
  xmlns:oadr="http://openadr.org/oadr-2.0b/2012/07"
  xmlns:ei="http://docs.oasis-open.org/ns/energyinterop/201110"
  xmlns:xcal="urn:ietf:params:xml:ns:icalendar-2.0"
  xmlns:strm="urn:ietf:params:xml:ns:icalendar-2.0:stream">
  <oadr:oadrSignedObject>
    <oadr:oadrDistributeEvent>
      <ei:eiEvent>
        <ei:eventDescriptor>
          <ei:eventID>${e.eventID}</ei:eventID>
          <ei:modificationNumber>${e.modificationNumber}</ei:modificationNumber>
          <ei:eventStatus>${e.eventStatus}</ei:eventStatus>
          <ei:testEvent>${e.testEvent}</ei:testEvent>
          <ei:vtnComment>${e.vtnComment}</ei:vtnComment>
        </ei:eventDescriptor>
        <ei:eiActivePeriod>
          <xcal:properties>
            <xcal:dtstart>
              <xcal:date-time>${e.dtstart}</xcal:date-time>
            </xcal:dtstart>
            <xcal:duration>
              <xcal:duration>${e.duration}</xcal:duration>
            </xcal:duration>
          </xcal:properties>
        </ei:eiActivePeriod>
        <ei:eiEventSignals>
          <ei:eiEventSignal>
            <ei:signalName>${e.signalName}</ei:signalName>
            <ei:currentValue>
              <ei:payloadFloat>
                <ei:value>${e.signalLevel}</ei:value>
              </ei:payloadFloat>
            </ei:currentValue>
          </ei:eiEventSignal>
        </ei:eiEventSignals>
      </ei:eiEvent>
    </oadr:oadrDistributeEvent>
  </oadr:oadrSignedObject>
</oadr:oadrPayload>`;
}

// ── OpenADR EiEvent endpoint — VEN polls here ──────────────────────────────
app.post('/EiEvent', (req, res) => {
  console.log('[VTN] Received oadrRequestEvent from VEN');
  res.set('Content-Type', 'application/xml');
  res.send(buildDistributeEvent());
  console.log(`[VTN] Sent event ${currentEvent.eventID} (status=${currentEvent.eventStatus} level=${currentEvent.signalLevel})`);
});

// ── Admin API — update the current event without restarting ───────────────
// PUT http://localhost:4010/admin/event
// Body: { "eventStatus": "active", "signalLevel": 3, "duration": "PT2H", ... }
app.put('/admin/event', (req, res) => {
  currentEvent = { ...currentEvent, ...req.body };
  currentEvent.modificationNumber += 1;
  console.log('[VTN] Event updated via admin API:', currentEvent);
  res.json({ ok: true, event: currentEvent });
});

// GET current event state
app.get('/admin/event', (req, res) => res.json(currentEvent));

// Quick health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mock-vtn' }));

app.listen(PORT, () => {
  console.log(`[VTN] Mock VTN listening on port ${PORT}`);
  console.log(`[VTN] POST /EiEvent          — VEN polls here`);
  console.log(`[VTN] GET  /admin/event      — inspect current event`);
  console.log(`[VTN] PUT  /admin/event      — change event (JSON body)`);
});
