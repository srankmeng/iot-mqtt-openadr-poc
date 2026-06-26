import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { VenModule } from './ven/ven.module';
import { VtnModule } from './vtn/vtn.module';

@Module({
  imports: [ScheduleModule.forRoot(), VenModule, VtnModule],
})
export class AppModule {}
