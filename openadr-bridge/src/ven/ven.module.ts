import { Module } from '@nestjs/common';
import { OadrXmlService } from '../oadr/oadr-xml.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { VenClientService } from './ven-client.service';
import { VenController } from './ven.controller';

@Module({
  controllers: [VenController],
  providers: [VenClientService, OadrXmlService, KafkaProducerService],
})
export class VenModule {}
