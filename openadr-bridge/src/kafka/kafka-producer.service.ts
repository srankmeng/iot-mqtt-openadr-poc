import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { DrEvent, DrReport } from '../oadr/oadr.types';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;

  private readonly topicDrEvents = process.env.KAFKA_TOPIC_DR_EVENTS || 'iot.dr_events';
  private readonly topicDrReports = process.env.KAFKA_TOPIC_DR_REPORTS || 'iot.dr_reports';

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'openadr-bridge',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });
    this.producer = kafka.producer();
    await this.producer.connect();
    this.logger.log('[Kafka] Producer connected');
  }

  async onModuleDestroy() {
    await this.producer?.disconnect();
  }

  async publishDrEvent(event: DrEvent) {
    await this.producer.send({
      topic: this.topicDrEvents,
      messages: [{ key: event.eventID, value: JSON.stringify(event) }],
    });
    this.logger.log(`[Kafka] Published DR event: ${event.eventID} → ${this.topicDrEvents}`);
  }

  async publishDrReport(report: DrReport) {
    await this.producer.send({
      topic: this.topicDrReports,
      messages: [{ key: report.venID, value: JSON.stringify(report) }],
    });
    this.logger.log(`[Kafka] Published DR report from VEN: ${report.venID} → ${this.topicDrReports}`);
  }
}
