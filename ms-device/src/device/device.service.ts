import { Injectable, Logger } from '@nestjs/common';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';

interface DeviceRecord {
  deviceId: string;
  lastSeen: string;
  lastPayload: any;
}

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);
  private readonly records: DeviceRecord[] = [];
  private readonly MAX_RECORDS = 500;

  constructor(private readonly mqttPublisher: MqttPublisherService) {}

  async processTelemetry(message: any): Promise<void> {
    const deviceId = message?.deviceId ?? 'unknown';
    const record: DeviceRecord = {
      deviceId,
      lastSeen: new Date().toISOString(),
      lastPayload: message?.payload,
    };

    this.records.push(record);
    if (this.records.length > this.MAX_RECORDS) {
      this.records.shift();
    }

    this.logger.log(`[DeviceService] Updated device: ${deviceId}`);

    const temp = message?.payload?.temperature;
    if (typeof temp === 'number' && temp > 40) {
      this.mqttPublisher.publish(`devices/${deviceId}/commands`, {
        action: 'alert',
        reason: 'high_temperature',
        value: temp,
        ts: new Date().toISOString(),
      });
    }
  }

  sendCommand(deviceId: string, command: object): void {
    this.mqttPublisher.publish(`devices/${deviceId}/commands`, {
      ...command,
      ts: new Date().toISOString(),
    });
  }

  listDevices(): DeviceRecord[] {
    return [...this.records].reverse();
  }
}
