import { Module } from '@nestjs/common';

import { TicketPurchasesController } from './ticket-purchases.controller';
import { TicketPurchasesService } from './ticket-purchases.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TicketPurchasesController],
  providers: [TicketPurchasesService],
})
export class TicketPurchasesModule {}