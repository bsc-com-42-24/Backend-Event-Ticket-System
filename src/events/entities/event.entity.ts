import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventStatus } from '../enums/event-status.enum';

@Entity('events')
@Check('CHK_events_capacity_positive', '"capacity" > 0')
@Check('CHK_events_dates', '"end_date" > "start_date"')
// FR-CAP-06: the database itself refuses negative availability / overselling
@Check('CHK_events_tickets_within_capacity', '"tickets_issued" >= 0 AND "tickets_issued" <= "capacity"')
@Index('IDX_events_status_start', ['status', 'startDate'])
@Index('IDX_events_created_by', ['createdBy'])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 150 })
  venue: string;

  @Column({ type: 'varchar', length: 255 })
  location: string;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  /** FR-CAP-01: maximum ticket capacity */
  @Column({ type: 'int' })
  capacity: number;

  /** FR-CAP-02: tickets issued so far (only changed through CapacityService) */
  @Column({ name: 'tickets_issued', type: 'int', default: 0 })
  ticketsIssued: number;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.DRAFT })
  status: EventStatus;

  /**
   * Owner (Event Manager) user id. Plain column on purpose so Member 3's work
   * doesn't depend on Member 2's User entity. After merge you may add:
   * @ManyToOne(() => User) @JoinColumn({ name: 'created_by' }) creator: User;
   */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
