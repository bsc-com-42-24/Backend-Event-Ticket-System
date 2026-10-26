import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('ticket_types')
export class TicketType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, (event) => event.ticketTypes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  price: number;

  @Column({ type: 'int' })
  totalQuantity: number;

  @Column({ type: 'int' })
  remainingQuantity: number;

  @OneToMany(() => Order, (order) => order.ticketType)
  orders: Order[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
