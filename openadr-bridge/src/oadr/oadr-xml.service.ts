import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { DrEvent, OadrEventStatus, OadrSignalName, ParsedOadrMessage, VenAck } from './oadr.types';

const OADR_NS = `xmlns:oadr="http://openadr.org/oadr-2.0b/2012/07"
             xmlns:ei="http://docs.oasis-open.org/ns/energyinterop/201110"
             xmlns:xcal="urn:ietf:params:xml:ns:icalendar-2.0"
             xmlns:strm="urn:ietf:params:xml:ns:icalendar-2.0:stream"`;

@Injectable()
export class OadrXmlService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: true,
    parseAttributeValue: true,
  });

  parse(xml: string): ParsedOadrMessage {
    const obj = this.parser.parse(xml);
    const signed =
      obj?.oadrPayload?.oadrSignedObject ?? obj?.oadrSignedObject ?? {};

    if (signed.oadrDistributeEvent) return { type: 'oadrDistributeEvent', raw: signed.oadrDistributeEvent };
    if (signed.oadrRequestEvent)    return { type: 'oadrRequestEvent',    raw: signed.oadrRequestEvent };
    if (signed.oadrCreatedEvent)    return { type: 'oadrCreatedEvent',    raw: signed.oadrCreatedEvent };
    if (signed.oadrUpdateReport)    return { type: 'oadrUpdateReport',    raw: signed.oadrUpdateReport };
    if (signed.oadrRegisterReport)  return { type: 'oadrRegisterReport',  raw: signed.oadrRegisterReport };
    if (signed.oadrPoll)            return { type: 'oadrPoll',            raw: signed.oadrPoll };
    return { type: 'unknown', raw: obj };
  }

  extractEvents(distributeEvent: any): DrEvent[] {
    const rawEvents = distributeEvent?.eiEvent ?? [];
    const events = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
    return events.map((e: any) => {
      const desc    = e?.eventDescriptor ?? {};
      const period  = e?.eiActivePeriod?.properties ?? {};
      const signal  = e?.eiEventSignals?.eiEventSignal ?? {};
      const sig     = Array.isArray(signal) ? signal[0] : signal;
      return {
        eventID:            String(desc.eventID ?? ''),
        modificationNumber: Number(desc.modificationNumber ?? 0),
        eventStatus:        (desc.eventStatus ?? OadrEventStatus.NONE) as OadrEventStatus,
        dtstart:            period?.dtstart?.['date-time'] ?? period?.dtstart ?? '',
        duration:           period?.duration?.duration ?? period?.duration ?? '',
        signalName:         (sig?.signalName ?? OadrSignalName.SIMPLE) as OadrSignalName,
        signalLevel:        Number(sig?.currentValue?.payloadFloat?.value ?? sig?.currentValue ?? 0),
        testEvent:          String(desc.testEvent) === 'true',
        vtnComment:         desc.vtnComment,
        receivedAt:         new Date().toISOString(),
      } as DrEvent;
    });
  }

  // Used by PULL transport — VEN sends this to ask the upstream VTN for events
  buildRequestEvent(venID: string, requestID: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<oadrPayload ${OADR_NS}>
  <oadr:oadrSignedObject>
    <oadr:oadrRequestEvent>
      <ei:eiRequestEvent>
        <requestID xmlns="http://docs.oasis-open.org/ns/energyinterop/201110/payloads">${requestID}</requestID>
        <ei:venID>${venID}</ei:venID>
        <ei:replyLimit>10</ei:replyLimit>
      </ei:eiRequestEvent>
    </oadr:oadrRequestEvent>
  </oadr:oadrSignedObject>
</oadrPayload>`;
  }

  // VTN → VEN outbound: distribute one or more DR events
  buildDistributeEvent(vtnID: string, requestID: string, events: DrEvent[]): string {
    const eiEvents = events.map((e) => `
      <ei:eiEvent>
        <ei:eventDescriptor>
          <ei:eventID>${e.eventID}</ei:eventID>
          <ei:modificationNumber>${e.modificationNumber}</ei:modificationNumber>
          <ei:eventStatus>${e.eventStatus}</ei:eventStatus>
          <ei:testEvent>${e.testEvent}</ei:testEvent>
          ${e.vtnComment ? `<ei:vtnComment>${e.vtnComment}</ei:vtnComment>` : ''}
        </ei:eventDescriptor>
        <ei:eiActivePeriod>
          <xcal:properties>
            <xcal:dtstart><xcal:date-time>${e.dtstart}</xcal:date-time></xcal:dtstart>
            <xcal:duration><xcal:duration>${e.duration}</xcal:duration></xcal:duration>
          </xcal:properties>
        </ei:eiActivePeriod>
        <ei:eiEventSignals>
          <ei:eiEventSignal>
            <ei:signalName>${e.signalName}</ei:signalName>
            <ei:currentValue>
              <ei:payloadFloat><ei:value>${e.signalLevel}</ei:value></ei:payloadFloat>
            </ei:currentValue>
          </ei:eiEventSignal>
        </ei:eiEventSignals>
      </ei:eiEvent>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<oadr:oadrPayload ${OADR_NS}>
  <oadr:oadrSignedObject>
    <oadr:oadrDistributeEvent>
      <ei:requestID>${requestID}</ei:requestID>
      <ei:vtnID>${vtnID}</ei:vtnID>
      ${eiEvents}
    </oadr:oadrDistributeEvent>
  </oadr:oadrSignedObject>
</oadr:oadrPayload>`;
  }

  // VTN ACK sent back to VEN after receiving oadrCreatedEvent
  buildOadrResponse(requestID: string, responseCode: number, description: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<oadr:oadrPayload ${OADR_NS}>
  <oadr:oadrSignedObject>
    <oadr:oadrResponse>
      <ei:eiResponse>
        <ei:requestID>${requestID}</ei:requestID>
        <ei:responseCode>${responseCode}</ei:responseCode>
        <ei:responseDescription>${description}</ei:responseDescription>
      </ei:eiResponse>
    </oadr:oadrResponse>
  </oadr:oadrSignedObject>
</oadr:oadrPayload>`;
  }

  // Parse oadrCreatedEvent sent by VEN as acknowledgment
  extractCreatedEvent(raw: any): VenAck {
    const created = raw?.eiCreatedEvent ?? raw;
    const rawResponses = created?.eventResponses?.eventResponse ?? [];
    const responses = (Array.isArray(rawResponses) ? rawResponses : [rawResponses])
      .filter(Boolean)
      .map((r: any) => ({
        eventID:            String(r?.qualifiedEventID?.eventID ?? r?.eventID ?? ''),
        modificationNumber: Number(r?.qualifiedEventID?.modificationNumber ?? 0),
        optType:            (r?.optType ?? 'optIn') as 'optIn' | 'optOut',
        responseCode:       Number(r?.responseCode ?? 200),
        responseDescription: String(r?.responseDescription ?? 'OK'),
      }));

    return {
      venID:      String(created?.venID ?? ''),
      requestID:  String(created?.requestID ?? ''),
      responses,
      receivedAt: new Date().toISOString(),
    };
  }
}
