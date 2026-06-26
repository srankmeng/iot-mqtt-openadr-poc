import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { VenModule } from './ven/ven.module';

@Module({
  imports: [ScheduleModule.forRoot(), VenModule],
})
export class AppModule {}
