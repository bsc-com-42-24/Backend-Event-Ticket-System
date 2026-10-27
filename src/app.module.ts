import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CapacityModule } from './capacity/capacity.module';
import { environmentValidationSchema } from './config/environment.validation';
import { EventsModule } from './events/events.module';
import { TicketsModule } from './tickets/tickets.module';
import { TicketTypesModule } from './ticket-types/ticket-types.module';
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
        migrationsRun: false,
        uuidExtension: 'pgcrypto',
      }),
    }),
    UsersModule,
    AuthModule,
    EventsModule,
    CapacityModule,
    TicketsModule,
    TicketTypesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}