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
import { TicketType } from '../../ticket-types/entities/ticket-type.entity';
import { Payment } from '../../payments/entities/payment.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'uuid' })
  ticketTypeId: string;

  @ManyToOne(() => TicketType, (ticketType) => ticketType.orders, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'ticketTypeId' })
  ticketType: TicketType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @OneToMany(() => Payment, (payment) => payment.order, { cascade: true })
  payments: Payment[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
