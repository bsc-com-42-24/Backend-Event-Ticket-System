import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketPurchaseController } from './ticket-purchase.controller';
import { TicketPurchaseService } from './ticket-purchase.service';

@Module({
  imports: [AuthModule],
  controllers: [TicketPurchaseController],
  providers: [TicketPurchaseService],
})
export class TicketPurchaseModule {}