import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('telemetry_records')
export class TelemetryRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: 'telemetry' | 'event';

  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  deviceId: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'jsonb' })
  payload: any;
}
