import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AdminController } from './admin/admin.controller';
import { AuthModule } from './auth/auth.module';
import { CapacityModule } from './capacity/capacity.module';
import { environmentValidationSchema } from './config/environment.validation';
import { ContactController } from './contact/contact.controller';
import { EventsModule } from './events/events.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizersModule } from './organizers/organizers.module';
import { StaffController } from './organizers/staff.controller';
import { PaymentsModule } from './payments/payments.module';
import { TicketTypesModule } from './ticket-types/ticket-types.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: true,
        uuidExtension: 'pgcrypto',
      }),
    }),
    UsersModule,
    AuthModule,
    EventsModule,
    CapacityModule,
    TicketsModule,
    TicketTypesModule,
    OrdersModule,
    OrganizersModule,
    PaymentsModule,
  ],
  controllers: [StaffController, ContactController, AdminController],
})
export class AppModule {}
