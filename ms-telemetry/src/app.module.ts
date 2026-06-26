import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryModule } from './telemetry/telemetry.module';
import { TelemetryRecord } from './telemetry/telemetry.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'egat',
      password: process.env.DB_PASSWORD || 'egat_secret',
      database: process.env.DB_NAME || 'egat_telemetry',
      entities: [TelemetryRecord],
      synchronize: true,
    }),
    TelemetryModule,
  ],
})
export class AppModule {}
