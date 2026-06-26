import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { VenClientService } from './ven-client.service';

@Controller('oadr')
export class VenController {
  private readonly logger = new Logger(VenController.name);

  constructor(private readonly ven: VenClientService) {}

  // Upstream VTN pushes oadrDistributeEvent here (PUSH transport)
  @Post('push')
  @HttpCode(200)
  async push(@Body() body: string) {
    this.logger.log('[PUSH] Received from upstream VTN');
    await this.ven.receivePush(body);
    return { received: true };
  }

  // View all received DR events (for debugging / monitoring)
  @Get('events')
  events() {
    return this.ven.getReceivedEvents();
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'ms-oadr',
      eventsReceived: this.ven.getReceivedEvents().length,
      ts: new Date().toISOString(),
    };
  }
}
