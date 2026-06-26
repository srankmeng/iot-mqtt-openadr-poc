import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';

@Module({
  controllers: [DeviceController],
  providers: [DeviceService, MqttPublisherService],
})
export class DeviceModule {}
