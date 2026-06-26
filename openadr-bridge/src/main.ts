import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse raw XML bodies before NestJS body parser
  app.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/xml') || ct.includes('text/xml')) {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => { req.body = data; next(); });
    } else {
      next();
    }
  });

  await app.listen(3000);
  console.log('[openadr-bridge] HTTP → http://localhost:3000');
  console.log('[openadr-bridge] --- VEN (upstream client) ---');
  console.log('[openadr-bridge] POST /oadr/push          — upstream VTN pushes DR events here');
  console.log('[openadr-bridge] GET  /oadr/events        — view received DR events');
  console.log('[openadr-bridge] GET  /oadr/health        — health check');
  console.log('[openadr-bridge] --- VTN (downstream server) ---');
  console.log('[openadr-bridge] POST /vtn/EiEvent        — VEN polls or sends oadrCreatedEvent ACK here');
  console.log('[openadr-bridge] POST /vtn/vens           — register a downstream VEN {venID, pushUrl}');
  console.log('[openadr-bridge] GET  /vtn/vens           — list registered VENs');
  console.log('[openadr-bridge] POST /vtn/events/distribute — update event + push to all VENs');
  console.log('[openadr-bridge] POST /vtn/events/push   — push current event to all VENs');
  console.log('[openadr-bridge] GET  /vtn/events/current — inspect current event state');
  console.log('[openadr-bridge] GET  /vtn/acks          — view oadrCreatedEvent ACKs from VENs');
  console.log('[openadr-bridge] GET  /vtn/health        — VTN health check');
}

bootstrap();
