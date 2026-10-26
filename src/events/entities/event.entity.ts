import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TicketType } from '../../ticket-types/entities/ticket-type.entity';

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'timestamp with time zone' })
  date: Date;

  @Column({ type: 'varchar', length: 255 })
  venue: string;

  @Column({ type: 'int' })
  totalCapacity: number;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.DRAFT,
  })
  status: EventStatus;

  @OneToMany(() => TicketType, (ticketType) => ticketType.event, {
    cascade: true,
  })
  ticketTypes: TicketType[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
