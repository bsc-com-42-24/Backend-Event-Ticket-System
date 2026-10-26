import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { Event } from './events/entities/event.entity';
import { TicketType } from './ticket-types/entities/ticket-type.entity';
import { Order } from './orders/entities/order.entity';
import { Payment } from './payments/entities/payment.entity';

import { EventsModule } from './events/events.module';
import { TicketTypesModule } from './ticket-types/ticket-types.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: Number(configService.get<number>('DB_PORT', 5432)),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'ticket_event_db'),
        entities: [Event, TicketType, Order, Payment],
        synchronize:
          configService.get<string>('NODE_ENV', 'development') !== 'production',
        logging:
          configService.get<string>('NODE_ENV', 'development') === 'development',
      }),
    }),
    EventsModule,
    TicketTypesModule,
    OrdersModule,
    PaymentsModule,
    HealthModule,
  ],
})
export class AppModule {}
