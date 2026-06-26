import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttPublisherService.name);
  private client: mqtt.MqttClient;

  onModuleInit() {
    const brokerUrl = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
    this.client = mqtt.connect(brokerUrl, {
      clientId: `ms-device-publisher-${Math.random().toString(16).slice(2, 8)}`,
    });

    this.client.on('connect', () =>
      this.logger.log(`Connected to MQTT broker: ${brokerUrl}`),
    );
    this.client.on('error', (err) =>
      this.logger.error(`MQTT connection error: ${err.message}`),
    );
  }

  publish(topic: string, payload: object): void {
    if (!this.client?.connected) {
      this.logger.warn(`MQTT not connected — dropping message to ${topic}`);
      return;
    }
    this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
    this.logger.log(`Published to ${topic}: ${JSON.stringify(payload)}`);
  }

  onModuleDestroy() {
    this.client?.end();
  }
}
