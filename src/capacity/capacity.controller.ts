import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NumericIdPipe } from '../events/pipes/numeric-id.pipe';
import { CapacityService } from './capacity.service';

@ApiTags('Capacity')
@Controller('events')
export class CapacityController {
  constructor(private readonly capacity: CapacityService) {}

  @Get(':id/availability')
  @ApiOperation({ summary: 'Capacity, tickets issued and remaining availability (public)' })
  availability(@Param('id', NumericIdPipe) id: string) {
    return this.capacity.getAvailability(id);
  }
}
