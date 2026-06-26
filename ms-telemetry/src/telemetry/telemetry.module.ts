import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, MqttPublisherService],
})
export class TelemetryModule {}
