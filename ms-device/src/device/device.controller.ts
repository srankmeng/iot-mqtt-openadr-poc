import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { DeviceService } from './device.service';

@Controller('devices')
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name);

  constructor(private readonly deviceService: DeviceService) {}

  // ── Kafka consumer ──────────────────────────────────────────────────────
  @EventPattern(process.env.KAFKA_TOPIC_TELEMETRY || 'iot.telemetry')
  async handleTelemetry(@Payload() message: any) {
    const data = message?.value ?? message;
    this.logger.log(`[Kafka] Received telemetry: ${JSON.stringify(data)}`);
    await this.deviceService.processTelemetry(data);
  }

  // ── REST endpoints ──────────────────────────────────────────────────────
  @Get()
  getDevices() {
    return this.deviceService.listDevices();
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'ms-device', ts: new Date().toISOString() };
  }

  @Post(':id/command')
  sendCommand(@Param('id') deviceId: string, @Body() body: object) {
    this.deviceService.sendCommand(deviceId, body);
    return { sent: true, deviceId, command: body };
  }
}
