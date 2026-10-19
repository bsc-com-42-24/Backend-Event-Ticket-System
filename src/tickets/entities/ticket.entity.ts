import {Entity,PrimaryGeneratedColumn,Column,CreateDateColumn,} from 'typeorm';

export enum TicketStatus {
ACTIVE = 'ACTIVE',
USED = 'USED',
CANCELLED = 'CANCELLED',
EXPIRED = 'EXPIRED',
}

@Entity('tickets')
export class Ticket {
@PrimaryGeneratedColumn('uuid')
id?: string;

@Column({ type: 'uuid', unique: true })
ticketIdentifier?: string;

@Column({ type: 'uuid' })
customerId?: string;

@Column({ type: 'uuid' })
eventId?: string;

@Column({
type: 'enum',
enum: TicketStatus,
default: TicketStatus.ACTIVE,
})
status?: TicketStatus;

@CreateDateColumn()
issuedAt?: Date;

@Column({ type: 'timestamp', nullable: true })
usedAt?: Date | null;
}