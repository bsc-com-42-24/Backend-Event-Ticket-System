import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import { Ticket } from './entities/ticket.entity';
import { TicketValidationReason } from './enums/ticket-validation-reason.enum';
import { QrCodeService } from './qr-code/qr-code.service';

interface TicketForValidation {
  ticket_id: string;
  ticket_number: string;
  event_id: string;
  ticket_status: string;
  checked_in_at: Date | null;
  event_status: string;
  organizer_id: string;
  event_title: string;
  event_venue: string | null;
  event_location: string | null;
  event_start_at: Date;
  event_end_at: Date;
  ticket_type_name: string;
  owner_name: string | null;
}

interface ValidationDetails {
  id: string;
  ticketNumber: string;
  status: string;
  checkedInAt: Date | null;
  ticketType: string;
  ownerName: string | null;
}

interface EventValidationDetails {
  id: string;
  title: string;
  venue: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
}

export type TicketValidationResult =
  | {
      accepted: true;
      reason: null;
      message: string;
      ticketId: string;
      eventId: string;
      validatedAt: Date;
      ticket: ValidationDetails;
      event: EventValidationDetails;
    }
  | {
      accepted: false;
      reason: TicketValidationReason;
      message: string;
      ticketId: string | null;
      eventId: string | null;
      validatedAt: null;
      ticket: ValidationDetails | null;
      event: EventValidationDetails | null;
    };

interface QrPayload {
  ticketId: string;
  token: string;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly qrCodeService: QrCodeService,
    private readonly dataSource: DataSource,
  ) {}

  async generateTickets(eventId: string, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      const events: {
        event_id: string;
        organizer_id: string;
        status: string;
        capacity: number;
        tickets_issued: number;
      }[] = await manager.query(
        `SELECT event_id, organizer_id, status, capacity, tickets_issued
         FROM events WHERE event_id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (
        !event ||
        (String(event.organizer_id) !== String(user.userId) &&
          user.role !== UserRole.ADMIN)
      ) {
        throw new NotFoundException('Event not found');
      }
      if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
        throw new ConflictException(
          `Cannot generate tickets for a ${event.status} event`,
        );
      }

      const types: {
        ticket_type_id: string;
        type_name: string;
        quantity_total: number;
      }[] = await manager.query(
        `SELECT ticket_type_id, type_name, quantity_total
         FROM ticket_types
         WHERE event_id = $1 AND is_active = TRUE
         ORDER BY ticket_type_id
         FOR UPDATE`,
        [eventId],
      );
      if (types.length === 0) {
        throw new ConflictException(
          'Create at least one active ticket type before generating tickets',
        );
      }

      const counts: { ticket_type_id: string; n: number }[] =
        await manager.query(
          `SELECT ticket_type_id, COUNT(*)::int AS n
           FROM tickets WHERE event_id = $1
           GROUP BY ticket_type_id`,
          [eventId],
        );
      const existing = new Map(
        counts.map((count) => [String(count.ticket_type_id), count.n]),
      );
      const plan = types.map((type) => {
        const alreadyCreated = existing.get(String(type.ticket_type_id)) ?? 0;
        return {
          ticketTypeId: type.ticket_type_id,
          typeName: type.type_name,
          toCreate: Math.max(0, type.quantity_total - alreadyCreated),
          totalAfter: Math.max(alreadyCreated, type.quantity_total),
        };
      });
      const totalNew = plan.reduce((total, item) => total + item.toCreate, 0);

      if (event.tickets_issued + totalNew > event.capacity) {
        throw new ConflictException(
          `Generating ${totalNew} more tickets would exceed event capacity ` +
            `(${event.tickets_issued} already issued, capacity ${event.capacity})`,
        );
      }

      for (const item of plan) {
        if (item.toCreate === 0) continue;

        const numbers: string[] = [];
        const tokens: string[] = [];
        for (let index = 0; index < item.toCreate; index += 1) {
          numbers.push(`TKT-${randomBytes(5).toString('hex').toUpperCase()}`);
          tokens.push(randomUUID());
        }

        await manager.query(
          `INSERT INTO tickets (ticket_number, event_id, ticket_type_id, qr_token)
           SELECT ticket.ticket_number, $3::bigint, $4::bigint, ticket.qr_token
           FROM unnest($1::text[], $2::uuid[]) AS ticket(ticket_number, qr_token)`,
          [numbers, tokens, eventId, item.ticketTypeId],
        );
      }

      if (totalNew > 0) {
        await manager.query(
          `UPDATE events
           SET tickets_issued = tickets_issued + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE event_id = $2`,
          [totalNew, eventId],
        );
      }

      return {
        eventId,
        capacity: event.capacity,
        ticketsIssued: event.tickets_issued + totalNew,
        newlyCreated: totalNew,
        ticketTypes: plan.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          typeName: item.typeName,
          created: item.toCreate,
          total: item.totalAfter,
        })),
      };
    });
  }

  async findByEvent(eventId: string, user: AuthenticatedUser) {
    await this.assertCanManageEvent(eventId, user, 'Event not found');
    return this.ticketRepository.find({
      where: { eventId },
      order: { id: 'ASC' },
    });
  }

  async getTicket(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.ticketRepository.findOne({
      where: { ticketNumber },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    await this.assertCanManageEvent(ticket.eventId, user, 'Ticket not found');
    return ticket;
  }

  async getTicketWithQrCode(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.getTicket(ticketNumber, user);
    const qrCode = await this.qrCodeService.generateQrCode(
      this.createQrPayload(ticket.id, ticket.qrToken),
    );
    return { ticket, qrCode };
  }

  async validateTicketImage(
    image: Buffer,
    validatorId: string,
    attemptedEventId?: string,
    validatorRole?: UserRole,
  ): Promise<TicketValidationResult> {
    const qrPayload = await this.qrCodeService.decodeQrCode(image);
    return this.validateTicket(
      qrPayload,
      validatorId,
      attemptedEventId,
      undefined,
      validatorRole,
    );
  }

  async validateTicket(
    qrToken: string | undefined,
    validatorId: string,
    attemptedEventId?: string,
    ticketNumber?: string,
    validatorRole?: UserRole,
  ): Promise<TicketValidationResult> {
    if (Boolean(qrToken) === Boolean(ticketNumber)) {
      throw new BadRequestException(
        'Provide exactly one of qrToken or ticketNumber',
      );
    }

    let lookup: { where: string; parameters: string[] };
    if (qrToken) {
      lookup = this.buildQrLookup(qrToken);
    } else if (ticketNumber) {
      lookup = {
        where: 't.ticket_number = $1',
        parameters: [ticketNumber],
      };
    } else {
      throw new BadRequestException(
        'Provide exactly one of qrToken or ticketNumber',
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const tickets: TicketForValidation[] = await manager.query(
        `SELECT t.ticket_id, t.ticket_number, t.event_id,
                t.status AS ticket_status, t.checked_in_at,
                e.status AS event_status, e.organizer_id,
                e.title AS event_title, e.venue AS event_venue,
                e.location AS event_location, e.start_at AS event_start_at,
                e.end_at AS event_end_at, tt.type_name AS ticket_type_name,
                u.full_name AS owner_name
         FROM tickets t
         JOIN events e ON e.event_id = t.event_id
         JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
         LEFT JOIN users u ON u.user_id = t.customer_id
         WHERE ${lookup.where}
         FOR UPDATE OF t, e`,
        lookup.parameters,
      );
      const ticket = tickets[0];
      if (!ticket) {
        return this.rejected(TicketValidationReason.NOT_FOUND);
      }
      if (
        validatorRole === UserRole.EVENT_MANAGER &&
        String(ticket.organizer_id) !== String(validatorId)
      ) {
        throw new NotFoundException('Ticket not found');
      }
      if (ticket.ticket_status === 'USED') {
        return this.rejected(TicketValidationReason.ALREADY_USED, ticket);
      }
      if (
        ticket.ticket_status === 'CANCELLED' ||
        ticket.ticket_status === 'REFUNDED'
      ) {
        return this.rejected(TicketValidationReason.CANCELLED, ticket);
      }
      if (ticket.event_status === 'CANCELLED') {
        return this.rejected(TicketValidationReason.EVENT_CANCELLED, ticket);
      }
      if (attemptedEventId && attemptedEventId !== ticket.event_id) {
        return this.rejected(TicketValidationReason.WRONG_EVENT, ticket);
      }

      const updatedTickets: {
        ticket_id: string;
        event_id: string;
        checked_in_at: Date;
      }[] = await manager.query(
        `UPDATE tickets
         SET status = 'USED', checked_in_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND status = 'ISSUED'
         RETURNING ticket_id, event_id, checked_in_at`,
        [ticket.ticket_id],
      );
      const updated = updatedTickets[0];
      if (!updated) {
        return this.rejected(TicketValidationReason.ALREADY_USED, ticket);
      }

      return {
        accepted: true as const,
        reason: null,
        message: 'Ticket accepted. Admit guest.',
        ticketId: updated.ticket_id,
        eventId: updated.event_id,
        validatedAt: updated.checked_in_at,
        ticket: this.toValidationTicket(
          ticket,
          'USED',
          updated.checked_in_at,
        ),
        event: this.toValidationEvent(ticket),
      };
    });

    await this.recordValidation(result, validatorId, attemptedEventId);
    return result;
  }

  async getCheckInSummary(
    eventId: string,
    user: AuthenticatedUser,
  ): Promise<{
    eventId: string;
    eventTitle: string;
    ticketsIssued: number;
    checkedIn: number;
    remaining: number;
  }> {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.EVENT_MANAGER
    ) {
      throw new ForbiddenException(
        'Only event managers and administrators can view check-in progress',
      );
    }

    const rows = await this.dataSource.query(
      `SELECT e.event_id, e.title,
              COUNT(t.ticket_id)::int AS tickets_issued,
              COUNT(t.ticket_id) FILTER (WHERE t.status = 'USED')::int AS checked_in
       FROM events e
       LEFT JOIN tickets t
         ON t.event_id = e.event_id
        AND (t.customer_id IS NOT NULL OR t.status = 'USED')
        AND t.status IN ('ISSUED', 'USED')
       WHERE e.event_id = $1
         AND ($2 = 'ADMIN' OR e.organizer_id = $3)
       GROUP BY e.event_id, e.title`,
      [eventId, user.role, user.userId],
    );
    const summary = rows[0];
    if (!summary) {
      throw new NotFoundException('Event not found');
    }

    return {
      eventId: String(summary.event_id),
      eventTitle: summary.title,
      ticketsIssued: Number(summary.tickets_issued),
      checkedIn: Number(summary.checked_in),
      remaining:
        Number(summary.tickets_issued) - Number(summary.checked_in),
    };
  }

  async purchaseTicket(
    userId: string,
    eventId: string,
    ticketTypeId: string,
    quantity: number,
  ) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    return this.dataSource.transaction(async (manager) => {
      const events: {
        status: string;
        start_at: Date;
        end_at: Date;
      }[] = await manager.query(
        `SELECT status, start_at, end_at
         FROM events WHERE event_id = $1 FOR SHARE`,
        [eventId],
      );
      const event = events[0];
      if (!event) {
        throw new NotFoundException('Event not found');
      }
      if (
        event.status !== 'PUBLISHED' ||
        new Date(event.start_at) <= new Date() ||
        new Date(event.end_at) <= new Date()
      ) {
        throw new ConflictException('Tickets are not on sale');
      }

      const types: {
        ticket_type_id: string;
        is_active: boolean;
        price: string | number;
        quantity_total: number;
        quantity_sold: number;
        quantity_reserved: number;
        per_order_limit: number;
        sales_start_at: Date | null;
        sales_end_at: Date | null;
      }[] = await manager.query(
        `SELECT ticket_type_id, is_active, price, quantity_total,
                quantity_sold, quantity_reserved, per_order_limit,
                sales_start_at, sales_end_at
         FROM ticket_types
         WHERE ticket_type_id = $1 AND event_id = $2
         FOR UPDATE`,
        [ticketTypeId, eventId],
      );
      const ticketType = types[0];
      if (!ticketType || !ticketType.is_active) {
        throw new NotFoundException('Ticket type unavailable');
      }
      if (Number(ticketType.price) > 0) {
        throw new ConflictException(
          'Paid checkout is not available yet. Only free tickets can be claimed.',
        );
      }
      if (quantity > ticketType.per_order_limit) {
        throw new BadRequestException(
          `You can claim at most ${ticketType.per_order_limit} ticket(s) per order`,
        );
      }
      const remaining =
        ticketType.quantity_total -
        ticketType.quantity_sold -
        ticketType.quantity_reserved;
      if (quantity > remaining) {
        throw new ConflictException(
          `Only ${Math.max(remaining, 0)} ticket(s) remain for this ticket type`,
        );
      }

      const now = new Date();
      if (
        (ticketType.sales_start_at &&
          now < new Date(ticketType.sales_start_at)) ||
        (ticketType.sales_end_at &&
          now > new Date(ticketType.sales_end_at))
      ) {
        throw new ConflictException('Ticket sales are not open');
      }

      const tickets: {
        ticket_id: string;
        ticket_number: string;
        qr_token: string;
      }[] = await manager.query(
        `SELECT ticket_id, ticket_number, qr_token
         FROM tickets
         WHERE event_id = $1 AND ticket_type_id = $2
           AND customer_id IS NULL AND status = 'ISSUED'
         ORDER BY ticket_id
         LIMIT $3
         FOR UPDATE SKIP LOCKED`,
        [eventId, ticketTypeId, quantity],
      );
      if (tickets.length < quantity) {
        throw new ConflictException(
          `Only ${tickets.length} ticket(s) remain for this ticket type`,
        );
      }

      const ids = tickets.map((ticket) => ticket.ticket_id);
      await manager.query(
        `UPDATE tickets SET customer_id = $1
         WHERE ticket_id = ANY($2::bigint[])`,
        [userId, ids],
      );
      const updatedTypes: { ticket_type_id: string }[] = await manager.query(
        `UPDATE ticket_types
         SET quantity_sold = quantity_sold + $1
         WHERE ticket_type_id = $2
           AND quantity_total - quantity_sold - quantity_reserved >= $1
         RETURNING ticket_type_id`,
        [quantity, ticketTypeId],
      );
      if (updatedTypes.length === 0) {
        throw new ConflictException('Ticket type inventory has changed');
      }

      return {
        eventId,
        ticketTypeId,
        quantity,
        paymentRequired: false,
        tickets: await Promise.all(
          tickets.map(async (ticket) => ({
            ticketId: String(ticket.ticket_id),
            ticketNumber: ticket.ticket_number,
            status: 'ISSUED',
            qrCodeDataUrl: await this.qrCodeService.generateQrCode(
              this.createQrPayload(ticket.ticket_id, ticket.qr_token),
            ),
          })),
        ),
      };
    });
  }

  async getCustomerBuyingHistory(userId: string) {
    const rows: {
      ticket_id: string;
      ticket_number: string;
      status: string;
      issued_at: Date;
      qr_token: string;
      event_title: string;
      start_at: Date;
      type_name: string;
      price: string | number;
      currency: string;
    }[] = await this.dataSource.query(
      `SELECT t.ticket_id, t.ticket_number, t.status, t.issued_at, t.qr_token,
              e.title AS event_title, e.start_at, tt.type_name, tt.price, tt.currency
       FROM tickets t
       JOIN events e ON t.event_id = e.event_id
       JOIN ticket_types tt ON t.ticket_type_id = tt.ticket_type_id
       WHERE t.customer_id = $1
       ORDER BY t.issued_at DESC`,
      [userId],
    );
    return Promise.all(
      rows.map(async (ticket) => ({
        ticketId: String(ticket.ticket_id),
        ticketNumber: ticket.ticket_number,
        status: ticket.status,
        issuedAt: ticket.issued_at,
        eventTitle: ticket.event_title,
        eventStartsAt: ticket.start_at,
        ticketType: ticket.type_name,
        price: Number(ticket.price),
        currency: ticket.currency.trim(),
        qrCodeDataUrl: await this.qrCodeService.generateQrCode(
          this.createQrPayload(ticket.ticket_id, ticket.qr_token),
        ),
      })),
    );
  }

  private buildQrLookup(qrPayload: string): {
    where: string;
    parameters: string[];
  } {
    let payload: QrPayload;
    try {
      const parsed: unknown = JSON.parse(qrPayload);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('ticketId' in parsed) ||
        !('token' in parsed) ||
        typeof parsed.ticketId !== 'string' ||
        typeof parsed.token !== 'string' ||
        !/^[1-9]\d{0,17}$/.test(parsed.ticketId) ||
        !this.isUuid(parsed.token)
      ) {
        throw new Error('Invalid QR payload');
      }
      payload = { ticketId: parsed.ticketId, token: parsed.token };
    } catch (error) {
      if (this.isUuid(qrPayload)) {
        return {
          where: 't.qr_token = $1',
          parameters: [qrPayload],
        };
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('The QR code does not contain a valid ticket');
    }

    return {
      where: 't.ticket_id = $1 AND t.qr_token = $2',
      parameters: [payload.ticketId, payload.token],
    };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private createQrPayload(ticketId: string, token: string): string {
    return JSON.stringify({ ticketId: String(ticketId), token });
  }

  private rejected(
    reason: TicketValidationReason,
    ticket?: TicketForValidation,
  ): TicketValidationResult {
    const messages: Record<TicketValidationReason, string> = {
      [TicketValidationReason.NOT_FOUND]: 'Ticket not found.',
      [TicketValidationReason.ALREADY_USED]:
        'This ticket has already been used.',
      [TicketValidationReason.CANCELLED]:
        'This ticket is cancelled or refunded.',
      [TicketValidationReason.WRONG_EVENT]:
        'This ticket is for a different event.',
      [TicketValidationReason.EVENT_CANCELLED]:
        'This event has been cancelled.',
    };

    return {
      accepted: false,
      reason,
      message: messages[reason],
      ticketId: ticket?.ticket_id ?? null,
      eventId: ticket?.event_id ?? null,
      validatedAt: null,
      ticket: ticket ? this.toValidationTicket(ticket) : null,
      event: ticket ? this.toValidationEvent(ticket) : null,
    };
  }

  private toValidationTicket(
    ticket: TicketForValidation,
    status = ticket.ticket_status,
    checkedInAt = ticket.checked_in_at,
  ): ValidationDetails {
    return {
      id: ticket.ticket_id,
      ticketNumber: ticket.ticket_number,
      status,
      checkedInAt,
      ticketType: ticket.ticket_type_name,
      ownerName: ticket.owner_name,
    };
  }

  private toValidationEvent(
    ticket: TicketForValidation,
  ): EventValidationDetails {
    return {
      id: ticket.event_id,
      title: ticket.event_title,
      venue: ticket.event_venue,
      location: ticket.event_location,
      startAt: ticket.event_start_at,
      endAt: ticket.event_end_at,
      status: ticket.event_status,
    };
  }

  private async recordValidation(
    result: TicketValidationResult,
    validatorId: string,
    attemptedEventId?: string,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO ticket_validations
           (ticket_id, checked_by, attempted_event_id, result, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result.ticketId,
          validatorId,
          attemptedEventId ?? null,
          result.accepted ? 'ACCEPTED' : 'REJECTED',
          result.reason,
        ],
      );
    } catch (error) {
      this.logger.error(
        'Failed to record ticket validation attempt',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async assertCanManageEvent(
    eventId: string,
    user: AuthenticatedUser,
    notFoundMessage: string,
  ): Promise<void> {
    const rows: { organizer_id: string }[] = await this.dataSource.query(
      `SELECT organizer_id FROM events WHERE event_id = $1`,
      [eventId],
    );
    const event = rows[0];
    if (
      !event ||
      (String(event.organizer_id) !== String(user.userId) &&
        user.role !== UserRole.ADMIN)
    ) {
      throw new NotFoundException(notFoundMessage);
    }
  }
}
