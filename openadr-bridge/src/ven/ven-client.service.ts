import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { OadrXmlService } from '../oadr/oadr-xml.service';
import { DrEvent } from '../oadr/oadr.types';

@Injectable()
export class VenClientService {
  private readonly logger = new Logger(VenClientService.name);

  private readonly vtnUrl = process.env.UPSTREAM_VTN_URL || '';
  private readonly venID = process.env.OADR_VEN_ID || 'VEN-EGAT-PLATFORM';
  private requestCounter = 0;

  // Received events stored in memory for the REST /oadr/events endpoint
  private readonly receivedEvents: DrEvent[] = [];

  constructor(
    private readonly xml: OadrXmlService,
    private readonly kafka: KafkaProducerService,
  ) {}

  // PULL: poll upstream VTN every 30 seconds
  @Interval('oadr-pull', 30000)
  async poll() {
    if (!this.vtnUrl) return;
    const requestID = `req-${Date.now()}-${++this.requestCounter}`;
    try {
      const body = this.xml.buildRequestEvent(this.venID, requestID);
      const res = await axios.post(`${this.vtnUrl}/EiEvent`, body, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 10000,
      });
      await this.processDistributeEvent(res.data);
    } catch (err) {
      this.logger.warn(`[PULL] Poll failed: ${err.message}`);
    }
  }

  // PUSH: called by the controller when upstream VTN posts to us
  async receivePush(xmlBody: string) {
    await this.processDistributeEvent(xmlBody);
  }

  getReceivedEvents(): DrEvent[] {
    return this.receivedEvents;
  }

  private async processDistributeEvent(xml: string) {
    const msg = this.xml.parse(xml);
    if (msg.type !== 'oadrDistributeEvent') {
      this.logger.warn(`Unexpected message type: ${msg.type}`);
      return;
    }
    const events = this.xml.extractEvents(msg.raw);
    for (const event of events) {
      this.receivedEvents.push(event);
      await this.kafka.publishDrEvent(event);
      this.logger.log(
        `[DR Event] id=${event.eventID} status=${event.eventStatus} signal=${event.signalName}:${event.signalLevel}`,
      );
    }
  }
}
