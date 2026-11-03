import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Event } from './event.entity';

/** Maps the `event_checkers` table for event-specific check-in staff assignments. */
@Entity('event_checkers')
@Unique(['eventId', 'userId'])
export class EventChecker {
  @PrimaryGeneratedColumn('identity', {
    name: 'event_checker_id',
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'event_id', type: 'bigint' })
  eventId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;

  @ManyToOne(() => Event, (event) => event.checkers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
