import { Controller, Get, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  private readonly logger = new Logger(TelemetryController.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  // ── Kafka consumers ─────────────────────────────────────────────────────
  @EventPattern(process.env.KAFKA_TOPIC_TELEMETRY || 'iot.telemetry')
  async handleTelemetry(@Payload() message: any) {
    const data = message?.value ?? message;
    this.logger.log(`[Kafka:telemetry] ${JSON.stringify(data)}`);
    await this.telemetryService.store(data, 'telemetry');
  }

  @EventPattern(process.env.KAFKA_TOPIC_EVENTS || 'iot.events')
  async handleEvent(@Payload() message: any) {
    const data = message?.value ?? message;
    this.logger.log(`[Kafka:events] ${JSON.stringify(data)}`);
    await this.telemetryService.store(data, 'event');
  }

  // ── REST endpoints ──────────────────────────────────────────────────────
  @Get()
  async getRecords() {
    return this.telemetryService.getAll();
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'ms-telemetry', ts: new Date().toISOString() };
  }
}
