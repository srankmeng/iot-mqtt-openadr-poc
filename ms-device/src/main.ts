import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  // HTTP server (REST API)
  const app = await NestFactory.create(AppModule);

  // Kafka microservice listener
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'ms-device',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      },
      consumer: {
        groupId: process.env.KAFKA_GROUP_ID || 'ms-device-group',
        fromBeginning: false,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(3000);
  console.log('[ms-device] HTTP  → http://localhost:3000');
  console.log('[ms-device] Kafka → listening on iot.telemetry');
}

bootstrap();
