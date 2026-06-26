import { Injectable, Logger } from '@nestjs/common';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';

interface TelemetryRecord {
  id: string;
  type: 'telemetry' | 'event';
  deviceId: string;
  receivedAt: string;
  payload: any;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  // In-memory ring buffer (last 500 records) – swap with TimescaleDB/InfluxDB
  private readonly records: TelemetryRecord[] = [];
  private readonly MAX_RECORDS = 500;

  constructor(private readonly mqttPublisher: MqttPublisherService) {}

  async store(message: any, type: 'telemetry' | 'event'): Promise<void> {
    const record: TelemetryRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      deviceId: message?.deviceId ?? 'unknown',
      receivedAt: new Date().toISOString(),
      payload: message?.payload ?? message,
    };

    this.records.push(record);
    if (this.records.length > this.MAX_RECORDS) {
      this.records.shift();
    }

    this.logger.log(`[TelemetryService] Stored ${type} from ${record.deviceId}`);

    this.mqttPublisher.publish(`devices/${record.deviceId}/ack`, {
      recordId: record.id,
      type,
      receivedAt: record.receivedAt,
    });
  }

  getAll(): TelemetryRecord[] {
    return [...this.records].reverse(); // newest first
  }
}
