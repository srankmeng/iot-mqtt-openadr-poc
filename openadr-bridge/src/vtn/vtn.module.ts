import { Module } from '@nestjs/common';
import { OadrXmlService } from '../oadr/oadr-xml.service';
import { VtnService } from './vtn.service';
import { VtnController } from './vtn.controller';

@Module({
  controllers: [VtnController],
  providers: [VtnService, OadrXmlService],
})
export class VtnModule {}
