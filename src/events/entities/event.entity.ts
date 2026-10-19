import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventStatus } from '../enums/event-status.enum';

/** Maps the `events` table of event_ticket_booking_schema.sql (+ capacity columns). */
@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('identity', {
    name: 'event_id',
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  /** Owner (Event Manager / organizer) user id */
  @Column({ name: 'organizer_id', type: 'bigint' })
  organizerId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 150 })
  venue: string;

  @Column({ type: 'varchar', length: 255 })
  location: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  /** FR-CAP-01: maximum ticket capacity */
  @Column({ type: 'int' })
  capacity: number;

  /** FR-CAP-02: tickets issued so far (only changed through CapacityService) */
  @Column({ name: 'tickets_issued', type: 'int', default: 0 })
  ticketsIssued: number;

  @Column({ type: 'varchar', length: 20, default: EventStatus.DRAFT })
  status: EventStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
