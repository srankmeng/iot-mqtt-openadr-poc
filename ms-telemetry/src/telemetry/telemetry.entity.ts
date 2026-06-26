import { Entity, Column, PrimaryColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity('telemetry_records')
export class TelemetryRecord {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 50 })
  type: 'telemetry' | 'event';

  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  deviceId: string;

  @PrimaryColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'jsonb' })
  payload: any;
}
