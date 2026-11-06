
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('identity', {
    name: 'order_id',
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'order_number', type: 'varchar', length: 50 })
  orderNumber: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @Column({ name: 'event_id', type: 'bigint' })
  eventId: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 12, scale: 2 })
  totalAmount: string;

  @Column({ type: 'char', length: 3, default: 'MWK' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
