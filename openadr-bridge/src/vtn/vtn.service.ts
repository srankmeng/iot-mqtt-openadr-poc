import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OadrXmlService } from '../oadr/oadr-xml.service';
import { DrEvent, OadrEventStatus, OadrSignalName, RegisteredVen, VenAck } from '../oadr/oadr.types';

@Injectable()
export class VtnService {
  private readonly logger = new Logger(VtnService.name);

  private readonly vtnID = process.env.OADR_VTN_ID || 'VTN-EGAT-PLATFORM';
  private readonly vens = new Map<string, RegisteredVen>();
  private readonly acks: VenAck[] = [];
  private reqCounter = 0;

  // Current event state; starts with a sensible default
  private currentEvents: DrEvent[] = [
    {
      eventID:            'EVT-VTN-001',
      modificationNumber: 0,
      eventStatus:        OadrEventStatus.NONE,
      dtstart:            new Date().toISOString(),
      duration:           'PT1H',
      signalName:         OadrSignalName.SIMPLE,
      signalLevel:        0,
      testEvent:          true,
      vtnComment:         'Default VTN event',
      receivedAt:         new Date().toISOString(),
    },
  ];

  constructor(private readonly xml: OadrXmlService) {}

  registerVen(venID: string, pushUrl: string): RegisteredVen {
    const ven: RegisteredVen = { venID, pushUrl, registeredAt: new Date().toISOString() };
    this.vens.set(venID, ven);
    this.logger.log(`[VTN] VEN registered: ${venID} → ${pushUrl}`);
    return ven;
  }

  getVens(): RegisteredVen[] {
    return Array.from(this.vens.values());
  }

  getCurrentEvents(): DrEvent[] {
    return this.currentEvents;
  }

  setCurrentEvents(events: DrEvent[]): void {
    this.currentEvents = events;
    this.logger.log(`[VTN] Current events updated (${events.length} event(s))`);
  }

  getAcks(): VenAck[] {
    return this.acks;
  }

  // Push oadrDistributeEvent to all registered VENs
  async distributeToAll(): Promise<Array<{ venID: string; ok: boolean; error?: string }>> {
    const results: Array<{ venID: string; ok: boolean; error?: string }> = [];

    for (const ven of this.vens.values()) {
      const requestID = `vtn-push-${Date.now()}-${++this.reqCounter}`;
      const body = this.xml.buildDistributeEvent(this.vtnID, requestID, this.currentEvents);
      try {
        const res = await axios.post(ven.pushUrl, body, {
          headers: { 'Content-Type': 'application/xml' },
          timeout: 10000,
        });
        this.logger.log(`[VTN] Pushed to VEN ${ven.venID} → ${ven.pushUrl} (${res.status})`);
        // If VEN replied with oadrCreatedEvent, parse and store it
        if (typeof res.data === 'string' && res.data.includes('oadrCreatedEvent')) {
          const msg = this.xml.parse(res.data);
          if (msg.type === 'oadrCreatedEvent') {
            const ack = this.xml.extractCreatedEvent(msg.raw);
            this.acks.push(ack);
            this.logger.log(`[VTN] ACK from VEN ${ack.venID}: ${ack.responses.length} response(s)`);
          }
        }
        results.push({ venID: ven.venID, ok: true });
      } catch (err) {
        this.logger.warn(`[VTN] Push failed for VEN ${ven.venID}: ${err.message}`);
        results.push({ venID: ven.venID, ok: false, error: err.message });
      }
    }

    return results;
  }

  // Handle a VEN-to-VTN message (poll or ack) and return the XML response
  handleVenMessage(xml: string): string {
    const msg = this.xml.parse(xml);
    const requestID = `vtn-resp-${Date.now()}-${++this.reqCounter}`;

    if (msg.type === 'oadrRequestEvent') {
      // VEN is polling for events — respond with current events
      const venID = String(msg.raw?.eiRequestEvent?.venID ?? msg.raw?.venID ?? 'unknown');
      this.logger.log(`[VTN] Poll request from VEN: ${venID}`);
      return this.xml.buildDistributeEvent(this.vtnID, requestID, this.currentEvents);
    }

    if (msg.type === 'oadrCreatedEvent') {
      // VEN is ACKing a distributed event
      const ack = this.xml.extractCreatedEvent(msg.raw);
      this.acks.push(ack);
      this.logger.log(
        `[VTN] oadrCreatedEvent from VEN ${ack.venID}: ${ack.responses.map((r) => `${r.eventID}=${r.optType}`).join(', ')}`,
      );
      return this.xml.buildOadrResponse(ack.requestID, 200, 'OK');
    }

    this.logger.warn(`[VTN] Unexpected message type from VEN: ${msg.type}`);
    return this.xml.buildOadrResponse(requestID, 400, `Unexpected message type: ${msg.type}`);
  }
}
