import { Body, Controller, Get, HttpCode, Logger, Post, Header } from '@nestjs/common';
import { VtnService } from './vtn.service';
import { DrEvent } from '../oadr/oadr.types';

@Controller('vtn')
export class VtnController {
  private readonly logger = new Logger(VtnController.name);

  constructor(private readonly vtn: VtnService) {}

  // VEN polls here (oadrRequestEvent) or sends ACK (oadrCreatedEvent)
  @Post('EiEvent')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml')
  eiEvent(@Body() body: string): string {
    this.logger.log('[VTN] Received VEN message on /vtn/EiEvent');
    return this.vtn.handleVenMessage(body);
  }

  // Admin: register a downstream VEN so the VTN can push to it
  @Post('vens')
  registerVen(@Body() body: { venID: string; pushUrl: string }) {
    return this.vtn.registerVen(body.venID, body.pushUrl);
  }

  // Admin: list registered VENs
  @Get('vens')
  listVens() {
    return this.vtn.getVens();
  }

  // Admin: update current event(s) and immediately push to all registered VENs
  @Post('events/distribute')
  async distribute(@Body() body: Partial<DrEvent> & { events?: Partial<DrEvent>[] }) {
    // Accept either a single event or an array under `events`
    const incoming: Partial<DrEvent>[] = body.events ?? [body];
    const existing = this.vtn.getCurrentEvents();

    const merged: DrEvent[] = incoming.map((patch, i) => ({
      ...existing[i] ?? existing[0],
      ...patch,
      modificationNumber: (existing[i]?.modificationNumber ?? existing[0]?.modificationNumber ?? 0) + 1,
      receivedAt: new Date().toISOString(),
    })) as DrEvent[];

    this.vtn.setCurrentEvents(merged);
    const results = await this.vtn.distributeToAll();
    return { distributed: merged, results };
  }

  // Admin: get current event state without pushing
  @Get('events/current')
  getCurrentEvents() {
    return this.vtn.getCurrentEvents();
  }

  // Admin: push current events to all VENs without changing them
  @Post('events/push')
  @HttpCode(200)
  async push() {
    const results = await this.vtn.distributeToAll();
    return { results };
  }

  // Admin: view all oadrCreatedEvent ACKs received from VENs
  @Get('acks')
  getAcks() {
    return this.vtn.getAcks();
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'vtn',
      vens: this.vtn.getVens().length,
      acks: this.vtn.getAcks().length,
      currentEvents: this.vtn.getCurrentEvents().length,
      ts: new Date().toISOString(),
    };
  }
}
