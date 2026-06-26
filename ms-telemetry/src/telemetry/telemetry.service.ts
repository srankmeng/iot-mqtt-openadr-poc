import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TelemetryRecord } from './telemetry.entity';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';

@Injectable()
export class TelemetryService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(TelemetryRecord)
    private readonly repo: Repository<TelemetryRecord>,
    private readonly dataSource: DataSource,
    private readonly mqttPublisher: MqttPublisherService,
  ) {}

  async onModuleInit() {
    await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
    await this.dataSource.query(`
      SELECT create_hypertable('telemetry_records', 'received_at', if_not_exists => TRUE);
    `);
    this.logger.log('TimescaleDB hypertable ready');
  }

  async store(message: any, type: 'telemetry' | 'event'): Promise<void> {
    const record = this.repo.create({
      type,
      deviceId: message?.deviceId ?? 'unknown',
      receivedAt: new Date(),
      payload: message?.payload ?? message,
    });

    await this.repo.save(record);
    this.logger.log(`[TelemetryService] Stored ${type} from ${record.deviceId}`);

    this.mqttPublisher.publish(`devices/${record.deviceId}/ack`, {
      recordId: record.id,
      type,
      receivedAt: record.receivedAt,
    });
  }

  async getAll(): Promise<TelemetryRecord[]> {
    return this.repo.find({
      order: { receivedAt: 'DESC' },
      take: 500,
    });
  }
}
