import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event])],
  controllers: [CapacityController],
  providers: [CapacityService],
  exports: [CapacityService], // Member 4 imports CapacityModule
})
export class CapacityModule {}
