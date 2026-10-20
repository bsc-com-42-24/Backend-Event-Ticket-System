import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TicketStatus {
  ISSUED = 'ISSUED',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/** Maps the `tickets` table of event_ticket_booking_schema.sql. */
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('identity', {
    name: 'ticket_id',
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'ticket_number', type: 'varchar', length: 50 })
  ticketNumber: string;

  @Column({ name: 'order_item_id', type: 'bigint' })
  orderItemId: string;

  @Column({ name: 'event_id', type: 'bigint' })
  eventId: string;

  @Column({ name: 'ticket_type_id', type: 'bigint' })
  ticketTypeId: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId: string;

  @Column({ name: 'qr_token', type: 'uuid' })
  qrToken: string;

  @Column({ type: 'varchar', length: 20, default: TicketStatus.ISSUED })
  status: TicketStatus;

  @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;
}