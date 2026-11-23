import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from '../users/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Ticket } from '../tickets/entities/ticket.entity';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment`);
  }
  return value;
}

export default new DataSource({
  type: 'postgres',
  host: requiredEnvironmentVariable('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 5432),
  username: requiredEnvironmentVariable('DB_USERNAME'),
  password: requiredEnvironmentVariable('DB_PASSWORD'),
  database: requiredEnvironmentVariable('DB_NAME'),
  entities: [
    User,
    Order,
    OrderItem,
    Payment,
    Ticket,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  uuidExtension: 'pgcrypto',
});
