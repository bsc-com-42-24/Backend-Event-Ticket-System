import { Module } from '@nestjs/common';

import { TicketPurchasesController } from './ticket-purchases.controller.js';
import { TicketPurchasesService } from './ticket-purchases.service.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [TicketPurchasesController],
  providers: [TicketPurchasesService],
})
export class TicketPurchasesModule {}