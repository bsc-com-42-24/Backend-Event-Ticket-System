import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TicketPurchasesModule } from './ticket-purchases/ticket-purchases.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TicketPurchasesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}