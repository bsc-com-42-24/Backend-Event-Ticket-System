import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    OrdersModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}