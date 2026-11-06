
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('identity', {
    name: 'order_item_id',
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'ticket_type_id', type: 'bigint' })
  ticketTypeId: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
