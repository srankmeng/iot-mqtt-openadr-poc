import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryRecord } from './telemetry.entity';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryRecord])],
  controllers: [TelemetryController],
  providers: [TelemetryService, MqttPublisherService],
})
export class TelemetryModule {}
