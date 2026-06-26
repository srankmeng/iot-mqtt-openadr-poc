import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'ms-telemetry',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      },
      consumer: {
        groupId: process.env.KAFKA_GROUP_ID || 'ms-telemetry-group',
        fromBeginning: false,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(3000);
  console.log('[ms-telemetry] HTTP  → http://localhost:3000');
  console.log('[ms-telemetry] Kafka → listening on iot.telemetry + iot.events');
}

bootstrap();
