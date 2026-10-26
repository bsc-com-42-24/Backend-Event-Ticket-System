import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TicketTypesController } from './ticket-types.controller';
import { TicketTypesService } from './ticket-types.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TicketTypesController],
  providers: [TicketTypesService],
})
export class TicketTypesModule {}
