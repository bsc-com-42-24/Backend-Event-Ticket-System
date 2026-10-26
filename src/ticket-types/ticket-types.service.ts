import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketType } from './entities/ticket-type.entity';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { Event } from '../events/entities/event.entity';

/**
 * Service managing ticket types under specific events.
 */
@Injectable()
export class TicketTypesService {
  constructor(
    @InjectRepository(TicketType)
    private readonly ticketTypeRepository: Repository<TicketType>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  /**
   * Create a new ticket type under an event.
   * Validates that the event exists and the total tickets allocated do not exceed the event capacity.
   * @param dto - Ticket type creation payload.
   * @returns Newly created ticket type entity.
   */
  async create(dto: CreateTicketTypeDto): Promise<TicketType> {
    const event = await this.eventRepository.findOne({
      where: { id: dto.eventId },
      relations: ['ticketTypes'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID "${dto.eventId}" not found.`);
    }

    const currentAllocated = event.ticketTypes.reduce(
      (sum, tt) => sum + tt.totalQuantity,
      0,
    );

    if (currentAllocated + dto.totalQuantity > event.totalCapacity) {
      throw new BadRequestException(
        `Total ticket quantity exceeds event capacity (${event.totalCapacity}). ` +
          `Current allocated: ${currentAllocated}, requested: ${dto.totalQuantity}.`,
      );
    }

    const ticketType = this.ticketTypeRepository.create({
      ...dto,
      remainingQuantity: dto.totalQuantity,
    });

    return this.ticketTypeRepository.save(ticketType);
  }

  /**
   * List all ticket types associated with a given event.
   * @param eventId - UUID of the event.
   * @returns Array of ticket types.
   */
  async findByEvent(eventId: string): Promise<TicketType[]> {
    return this.ticketTypeRepository.find({
      where: { eventId },
      order: { price: 'ASC' },
    });
  }

  /**
   * Find a ticket type by its unique identifier.
   * @param id - UUID of the ticket type.
   * @returns Found ticket type.
   * @throws NotFoundException if not found.
   */
  async findOne(id: string): Promise<TicketType> {
    const ticketType = await this.ticketTypeRepository.findOne({
      where: { id },
      relations: ['event'],
    });

    if (!ticketType) {
      throw new NotFoundException(`TicketType with ID "${id}" was not found.`);
    }

    return ticketType;
  }

  /**
   * Update an existing ticket type.
   * Ensures new capacity does not conflict with existing sold tickets or event capacity.
   * @param id - UUID of the ticket type.
   * @param dto - Update fields.
   * @returns Updated ticket type.
   */
  async update(id: string, dto: UpdateTicketTypeDto): Promise<TicketType> {
    const ticketType = await this.findOne(id);
    const event = await this.eventRepository.findOne({
      where: { id: ticketType.eventId },
      relations: ['ticketTypes'],
    });

    if (dto.totalQuantity !== undefined) {
      const soldQuantity =
        ticketType.totalQuantity - ticketType.remainingQuantity;

      if (dto.totalQuantity < soldQuantity) {
        throw new BadRequestException(
          `Cannot reduce total quantity to ${dto.totalQuantity} because ${soldQuantity} tickets have already been ordered.`,
        );
      }

      // Check overall event capacity
      if (event) {
        const otherAllocated = event.ticketTypes
          .filter((tt) => tt.id !== ticketType.id)
          .reduce((sum, tt) => sum + tt.totalQuantity, 0);

        if (otherAllocated + dto.totalQuantity > event.totalCapacity) {
          throw new BadRequestException(
            `Total ticket quantity exceeds event capacity (${event.totalCapacity}). ` +
              `Other allocated: ${otherAllocated}, requested: ${dto.totalQuantity}.`,
          );
        }
      }

      const diff = dto.totalQuantity - ticketType.totalQuantity;
      ticketType.remainingQuantity += diff;
      ticketType.totalQuantity = dto.totalQuantity;
    }

    if (dto.name !== undefined) {
      ticketType.name = dto.name;
    }
    if (dto.price !== undefined) {
      ticketType.price = dto.price;
    }

    return this.ticketTypeRepository.save(ticketType);
  }

  /**
   * Delete a ticket type.
   * @param id - UUID of ticket type.
   * @throws BadRequestException if tickets have been sold.
   */
  async remove(id: string): Promise<void> {
    const ticketType = await this.ticketTypeRepository.findOne({
      where: { id },
      relations: ['orders'],
    });

    if (!ticketType) {
      throw new NotFoundException(`TicketType with ID "${id}" was not found.`);
    }

    if (ticketType.orders && ticketType.orders.length > 0) {
      throw new BadRequestException(
        'Cannot delete ticket type that has existing customer orders associated with it.',
      );
    }

    await this.ticketTypeRepository.remove(ticketType);
  }
}
