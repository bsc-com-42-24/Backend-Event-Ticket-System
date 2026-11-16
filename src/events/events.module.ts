import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Event } from './entities/event.entity';
import { EventImagesController } from './event-images.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Event]), AuthModule],
  controllers: [EventImagesController, EventsController],
  providers: [EventsService, OptionalJwtAuthGuard],
  exports: [EventsService, TypeOrmModule],
})
export class EventsModule {}
