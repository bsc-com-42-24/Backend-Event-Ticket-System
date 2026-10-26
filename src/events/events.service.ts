import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

/**
 * Service managing event entities and administrative workflows.
 */
@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  /**
   * Create a new event with initial configuration.
   * @param dto - Event creation payload.
   * @returns Newly created event entity.
   */
  async createEvent(dto: CreateEventDto): Promise<Event> {
    const event = this.eventRepository.create({
      ...dto,
      status: dto.status ?? EventStatus.DRAFT,
    });
    return this.eventRepository.save(event);
  }

  /**
   * Retrieve all events, optionally filtered by publication status.
   * @param status - Optional event status filter.
   * @returns List of event entities matching criteria.
   */
  async findAll(status?: EventStatus): Promise<Event[]> {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.ticketTypes', 'ticketTypes')
      .orderBy('event.date', 'ASC');

    if (status) {
      query.where('event.status = :status', { status });
    }

    return query.getMany();
  }

  /**
   * Find a single event by its unique identifier.
   * @param id - UUID of the event.
   * @returns Found event entity.
   * @throws NotFoundException if the event does not exist.
   */
  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['ticketTypes'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID "${id}" was not found.`);
    }

    return event;
  }

  /**
   * Update an existing event's details.
   * @param id - UUID of the event to update.
   * @param dto - Partial event update payload.
   * @returns Updated event entity.
   * @throws NotFoundException if the event does not exist.
   * @throws BadRequestException if the event has been completed.
   */
  async updateEvent(id: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findOne(id);

    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot modify an event that has already been completed.',
      );
    }

    Object.assign(event, dto);
    return this.eventRepository.save(event);
  }

  /**
   * Cancel an event and update its status.
   * @param id - UUID of the event to cancel.
   * @returns Cancelled event entity.
   * @throws NotFoundException if the event does not exist.
   * @throws BadRequestException if already completed or cancelled.
   */
  async cancelEvent(id: string): Promise<Event> {
    const event = await this.findOne(id);

    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed event.');
    }
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled.');
    }

    event.status = EventStatus.CANCELLED;
    return this.eventRepository.save(event);
  }

  /**
   * Publish an event to make it active for ticketing.
   * @param id - UUID of the event to publish.
   * @returns Published event entity.
   * @throws NotFoundException if the event does not exist.
   * @throws BadRequestException if the event is cancelled or completed.
   */
  async publishEvent(id: string): Promise<Event> {
    const event = await this.findOne(id);

    if (
      event.status === EventStatus.CANCELLED ||
      event.status === EventStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot publish an event with status "${event.status}".`,
      );
    }

    event.status = EventStatus.PUBLISHED;
    return this.eventRepository.save(event);
  }
}
