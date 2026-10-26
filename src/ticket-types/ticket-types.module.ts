import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketType } from './entities/ticket-type.entity';
import { Event } from '../events/entities/event.entity';
import { TicketTypesService } from './ticket-types.service';
import { TicketTypesController } from './ticket-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TicketType, Event])],
  controllers: [TicketTypesController],
  providers: [TicketTypesService],
  exports: [TicketTypesService],
})
export class TicketTypesModule {}
