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
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import { Ticket } from './entities/ticket.entity';
import { TicketValidationReason } from './enums/ticket-validation-reason.enum';
import { QrCodeService } from './qr-code/qr-code.service';
import {
  purchaseRequiresPayment,
  verifyPayChanguPayment,
  type VerifiedPayChanguPayment,
} from './paychangu-verify';

interface TicketForValidation {
  ticket_id: string;
  event_id: string;
  ticket_status: string;
  event_status: string;
}

interface UpdatedTicket {
  ticket_id: string;
  event_id: string;
  checked_in_at: Date;
}

export type TicketValidationResult =
  | {
      accepted: true;
      reason: null;
      ticketId: string;
      eventId: string;
      validatedAt: Date;
    }
  | {
      accepted: false;
      reason: TicketValidationReason;
      ticketId: string | null;
      eventId: string | null;
      validatedAt: null;
    };

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly qrCodeService: QrCodeService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Organizer action: generate the tickets for an event from the capacity and
   * ticket-type quantities the organizer configured.
   *
   * - Creates only the tickets that are still missing for each active ticket
   *   type, so calling it twice never creates duplicates.
   * - Never lets the total exceed the event capacity.
   * - Every ticket gets a random, unguessable qr_token.
   * - Runs in one transaction with the event row locked.
   */
  async generateTickets(eventId: string, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (m) => {
      const events: {
        event_id: string;
        organizer_id: string;
        status: string;
        capacity: number;
        tickets_issued: number;
      }[] = await m.query(
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
      }[] = await m.query(
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

      const counts: { ticket_type_id: string; n: number }[] = await m.query(
        `SELECT ticket_type_id, COUNT(*)::int AS n
         FROM tickets WHERE event_id = $1
         GROUP BY ticket_type_id`,
        [eventId],
      );
      const existing = new Map(counts.map((c) => [String(c.ticket_type_id), c.n]));

      const plan = types.map((t) => {
        const have = existing.get(String(t.ticket_type_id)) ?? 0;
        return {
          ticketTypeId: t.ticket_type_id,
          typeName: t.type_name,
          toCreate: Math.max(0, t.quantity_total - have),
          totalAfter: Math.max(have, t.quantity_total),
        };
      });
      const totalNew = plan.reduce((sum, p) => sum + p.toCreate, 0);

      if (event.tickets_issued + totalNew > event.capacity) {
        throw new ConflictException(
          `Generating ${totalNew} more tickets would exceed the event capacity ` +
            `(${event.tickets_issued} already issued, capacity ${event.capacity})`,
        );
      }

      for (const p of plan) {
        if (p.toCreate === 0) continue;
        const numbers: string[] = [];
        const tokens: string[] = [];
        for (let i = 0; i < p.toCreate; i++) {
          numbers.push(`TKT-${randomBytes(5).toString('hex').toUpperCase()}`);
          tokens.push(randomUUID());
        }
        await m.query(
          `INSERT INTO tickets (ticket_number, event_id, ticket_type_id, qr_token)
           SELECT t.n, $3::bigint, $4::bigint, t.q
           FROM unnest($1::text[], $2::uuid[]) AS t(n, q)`,
          [numbers, tokens, eventId, p.ticketTypeId],
        );
      }

      if (totalNew > 0) {
        await m.query(
          `UPDATE events
           SET tickets_issued = tickets_issued + $1, updated_at = CURRENT_TIMESTAMP
           WHERE event_id = $2`,
          [totalNew, eventId],
        );
      }

      return {
        eventId,
        capacity: event.capacity,
        ticketsIssued: event.tickets_issued + totalNew,
        newlyCreated: totalNew,
        ticketTypes: plan.map((p) => ({
          ticketTypeId: p.ticketTypeId,
          typeName: p.typeName,
          created: p.toCreate,
          total: p.totalAfter,
        })),
      };
    });
  }

  /**
   * Attendee / ticket-sales report for an event (organizer of the event or admin).
   * One row per generated ticket. Sold tickets carry the buyer, ticket type, price,
   * the real purchase time and the payment status; unsold ones have customerId = null.
   * The old flat fields are kept so existing callers keep working.
   */
  async findByEvent(eventId: string, user: AuthenticatedUser) {
    await this.assertCanManageEvent(eventId, user, 'Event not found');
    return this.dataSource.query(
      `SELECT t.ticket_id AS id,
              t.ticket_number AS "ticketNumber",
              t.event_id AS "eventId",
              t.ticket_type_id AS "ticketTypeId",
              t.customer_id AS "customerId",
              t.status,
              CASE WHEN t.customer_id IS NULL THEN 'UNSOLD'
                   WHEN t.status = 'ISSUED' THEN 'VALID'
                   WHEN t.status = 'USED' THEN 'CHECKED_IN'
                   ELSE t.status END AS "ticketStatus",
              t.issued_at AS "issuedAt",
              COALESCE(t.purchased_at, pay.verified_at) AS "purchasedAt",
              COALESCE(t.purchased_at, pay.verified_at) AS "purchaseDate",
              t.checked_in_at AS "checkedInAt",
              t.order_item_id AS "orderItemId",
              CASE WHEN t.customer_id IS NULL THEN NULL
                   ELSE COALESCE(pc.status, pay.status, 'UNVERIFIED') END AS "paymentStatus",
              COALESCE(pc.tx_ref, pay.tx_ref) AS "paymentReference",
              CASE WHEN u.user_id IS NULL THEN NULL
                   ELSE json_build_object(
                     'userId', u.user_id::text,
                     'fullName', u.full_name,
                     'email', u.email) END AS attendee,
              json_build_object(
                'ticketTypeId', tt.ticket_type_id::text,
                'name', tt.type_name,
                'price', tt.price,
                'currency', trim(tt.currency)) AS "ticketType",
              u.full_name AS "customerName",
              u.email AS "customerEmail",
              tt.type_name AS "typeName",
              tt.price
       FROM tickets t
       JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
       LEFT JOIN users u ON u.user_id = t.customer_id
       LEFT JOIN ticket_payment_claims pc ON pc.tx_ref = t.payment_tx_ref
       LEFT JOIN order_items oi ON oi.order_item_id = t.order_item_id
       LEFT JOIN LATERAL (
         SELECT p.status, p.tx_ref, p.verified_at
         FROM payments p
         WHERE p.order_id = oi.order_id
         ORDER BY (p.status = 'SUCCESS') DESC, p.created_at DESC
         LIMIT 1
       ) pay ON TRUE
       WHERE t.event_id = $1
       ORDER BY t.ticket_id ASC`,
      [eventId],
    );
  }

  /** One ticket, visible to the organizer of its event or an admin. */
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

  /** Ticket plus a QR code (PNG data URL) that encodes the secret qr_token. */
  async getTicketWithQrCode(ticketNumber: string, user: AuthenticatedUser) {
    const ticket = await this.getTicket(ticketNumber, user);
    const qrCode = await this.qrCodeService.generateQrCode(ticket.qrToken);
    return { ticket, qrCode };
  }
  
  /** Throws a 404 unless the user organizes the event or is an admin. */
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
  /**
   * Validates a ticket for entry.
   *
   * Admins may validate any ticket. Everyone else (check-in staff) may only
   * validate tickets of events they are assigned to by their organizer; that
   * is the default when no role is passed, so callers fail closed.
   */
  async validateTicket(
    qrToken: string,
    validatorId: string,
    attemptedEventId?: string,
    validatorRole: UserRole = UserRole.VALIDATOR,
  ): Promise<TicketValidationResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const tickets: TicketForValidation[] = await manager.query(
        `SELECT t.ticket_id, t.event_id, t.status AS ticket_status, e.status AS event_status
         FROM tickets t
         JOIN events e ON e.event_id = t.event_id
         WHERE t.qr_token = $1
         FOR UPDATE OF t, e`,
        [qrToken],
      );

      const ticket = tickets[0];
      if (!ticket) {
        return this.rejected(TicketValidationReason.NOT_FOUND);
      }
      // Checked before anything else so staff learn nothing (status, ids,
      // customer details) about tickets of events they are not assigned to.
      if (
        validatorRole !== UserRole.ADMIN &&
        !(await this.isAssignedToEvent(
          manager,
          validatorId,
          ticket.event_id,
        ))
      ) {
        return this.rejected(TicketValidationReason.NOT_ASSIGNED);
      }
      if (ticket.ticket_status === 'USED') {
        return this.rejected(
          TicketValidationReason.ALREADY_USED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }
      if (
        ticket.ticket_status === 'CANCELLED' ||
        ticket.ticket_status === 'REFUNDED'
      ) {
        return this.rejected(
          TicketValidationReason.CANCELLED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }
      if (ticket.event_status === 'CANCELLED') {
        return this.rejected(
          TicketValidationReason.EVENT_CANCELLED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }
      if (attemptedEventId && attemptedEventId !== ticket.event_id) {
        return this.rejected(
          TicketValidationReason.WRONG_EVENT,
          ticket.ticket_id,
          ticket.event_id,
        );
      }

      const updatedTickets: UpdatedTicket[] = await manager.query(
        `UPDATE tickets
         SET status = 'USED', checked_in_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND status = 'ISSUED'
         RETURNING ticket_id, event_id, checked_in_at`,
        [ticket.ticket_id],
      );
      // TypeORM's postgres driver returns [rows, rowCount] for UPDATE ... RETURNING
      // (a flat row list is also accepted, as the unit-test mocks provide).
      const updated = Array.isArray(updatedTickets[0])
        ? (updatedTickets[0] as unknown as UpdatedTicket[])[0]
        : updatedTickets[0];
      if (!updated) {
        return this.rejected(
          TicketValidationReason.ALREADY_USED,
          ticket.ticket_id,
          ticket.event_id,
        );
      }

      return {
        accepted: true as const,
        reason: null,
        ticketId: updated.ticket_id,
        eventId: updated.event_id,
        validatedAt: updated.checked_in_at,
      };
    });

    await this.recordValidation(result, validatorId, attemptedEventId);
    return result;
  }

  /**
   * True when the user is an active check-in staff member of the event's own
   * organizer and has been assigned to this event.
   */
  private async isAssignedToEvent(
    manager: EntityManager,
    staffId: string,
    eventId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      `SELECT 1
       FROM staff_event_assignments sea
       JOIN organizer_staff os ON os.staff_id = sea.staff_id
       JOIN users u ON u.user_id = sea.staff_id
       JOIN events e ON e.event_id = sea.event_id
       WHERE sea.staff_id = $1
         AND sea.event_id = $2
         AND u.is_active = TRUE
         AND u.role = 'CHECK_IN_STAFF'
         AND e.organizer_id = os.organizer_id`,
      [staffId, eventId],
    );
    return rows.length > 0;
  }

  private rejected(
    reason: TicketValidationReason,
    ticketId: string | null = null,
    eventId: string | null = null,
  ): TicketValidationResult {
    return {
      accepted: false,
      reason,
      ticketId,
      eventId,
      validatedAt: null,
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

  /**
   * Customer action: claim one unassigned generated ticket of a ticket type.
   * Tickets are created by the organizer's generate step, so a purchase never
   * creates new rows and can never exceed the event capacity.
   */
  async purchaseTicket(
    userId: string,
    eventId: string,
    ticketTypeId: string,
    txRef?: string,
  ) {
    // Ask PayChangu BEFORE opening the transaction so no row stays locked while we wait.
    const paid = txRef ? await verifyPayChanguPayment(txRef) : null;

    return this.dataSource.transaction(async (m) => {
      const [tt] = await m.query(
         `SELECT tt.ticket_type_id, tt.is_active,
        tt.sales_start_at, tt.sales_end_at,
        tt.quantity_total, tt.quantity_sold, tt.quantity_reserved,
        tt.price, tt.currency,
        e.status AS event_status
         FROM ticket_types tt JOIN events e ON e.event_id = tt.event_id
         WHERE tt.ticket_type_id = $1 AND tt.event_id = $2
         FOR UPDATE OF tt`,
        [ticketTypeId, eventId],
      );
      if (!tt || !tt.is_active || tt.event_status !== 'PUBLISHED') {
        throw new NotFoundException('Ticket type unavailable');
      }
      const availableQuantity =
        Number(tt.quantity_total) -
        Number(tt.quantity_sold) -
        Number(tt.quantity_reserved);

      if (availableQuantity < 1) {
        throw new BadRequestException(
          'No unreserved tickets are available for this ticket type',
        );
      }
      
      const now = new Date();
      if (
        (tt.sales_start_at && now < tt.sales_start_at) ||
        (tt.sales_end_at && now > tt.sales_end_at)
      ) {
        throw new BadRequestException('Ticket sales are not open');
      }

      // Payment gate: a priced ticket can only be claimed with a payment that
      // PayChangu itself confirmed (verified before this transaction started).
      if (!paid && Number(tt.price) > 0 && purchaseRequiresPayment()) {
        throw new BadRequestException(
          'A successful PayChangu payment (txRef) is required to buy this ticket',
        );
      }
      if (paid && txRef) {
        await this.useVerifiedPayment(m, {
          txRef,
          userId,
          eventId,
          ticketTypeId,
          unitPrice: tt.price,
          currency: tt.currency,
          paid,
        });
      }

      const [ticket] = await m.query(
        `SELECT ticket_id, ticket_number, qr_token FROM tickets
         WHERE event_id = $1 AND ticket_type_id = $2
           AND customer_id IS NULL AND status = 'ISSUED'
         ORDER BY ticket_id LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [eventId, ticketTypeId],
      );
      if (!ticket) throw new BadRequestException('Tickets are sold out');

      await m.query(
        `UPDATE tickets
         SET customer_id = $1,
             purchased_at = CURRENT_TIMESTAMP,
             payment_tx_ref = $3
         WHERE ticket_id = $2`,
        [userId, ticket.ticket_id, paid && txRef ? txRef : null],
      );
      await m.query(
        `UPDATE ticket_types SET quantity_sold = quantity_sold + 1 WHERE ticket_type_id = $1`,
        [ticketTypeId],
      );

      return {
        ticketNumber: ticket.ticket_number,
        qrCodeDataUrl: await this.qrCodeService.generateQrCode(
          ticket.qr_token,
        ),
        status: 'ISSUED',
      };
    });
  }
      /** A customer's tickets, including event details and their QR code images. */
  async getCustomerBuyingHistory(userId: string) {
    const rows = await this.dataSource.query(
      `SELECT
         t.ticket_id,
         t.ticket_number,
         t.status AS ticket_status,
         t.issued_at,
         t.checked_in_at,
         t.purchased_at,
         t.qr_token,

         e.event_id,
         e.title AS event_title,
         e.description AS event_description,
         e.category AS event_category,
         e.banner_url AS event_banner_url,
         e.event_type,
         e.start_at,
         e.end_at,

         COALESCE(v.venue_name, e.venue) AS venue_name,
         v.address AS venue_address,
         v.city AS venue_city,
         v.country AS venue_country,
         e.location AS event_location,

         tt.ticket_type_id,
         tt.type_name,
         tt.description AS ticket_type_description,
         tt.price,
         tt.currency,

         u.full_name AS organizer_name

       FROM tickets t
       JOIN events e
         ON e.event_id = t.event_id
       JOIN ticket_types tt
         ON tt.ticket_type_id = t.ticket_type_id
       LEFT JOIN venues v
         ON v.venue_id = e.venue_id
       JOIN users u
         ON u.user_id = e.organizer_id

       WHERE t.customer_id = $1
       ORDER BY COALESCE(t.purchased_at, t.issued_at) DESC`,
      [userId],
    );

    return Promise.all(
      rows.map(async (r: any) => {
        const qrCodeDataUrl =
          await this.qrCodeService.generateQrCode(r.qr_token);

        return {
          ticketId: r.ticket_id,
          ticketNumber: r.ticket_number,
          status: r.ticket_status,
          issuedAt: r.issued_at,
          purchasedAt: r.purchased_at ?? null,
          checkedInAt: r.checked_in_at ?? null,
          // flat copies of the nested ids, which is what the React app reads
          eventId: r.event_id,
          ticketTypeId: r.ticket_type_id,

          event: {
            eventId: r.event_id,
            title: r.event_title,
            description: r.event_description,
            category: r.event_category,
            bannerUrl: r.event_banner_url,
            eventType: r.event_type,
            startAt: r.start_at,
            endAt: r.end_at,
          },

          venue: {
            name: r.venue_name,
            address: r.venue_address,
            city: r.venue_city,
            country: r.venue_country,
            location: r.event_location,
          },

          ticketType: {
            ticketTypeId: r.ticket_type_id,
            name: r.type_name,
            description: r.ticket_type_description,
            price: r.price,
            currency: r.currency,
          },

          organizer: {
            name: r.organizer_name,
          },

          qrCodeDataUrl,
        };
      }),
    );
  }
    /** Scan = validateTicket + the ticket details the staff member needs to see. */
  async scanTicket(
    qrToken: string,
    validatorId: string,
    attemptedEventId?: string,
    validatorRole: UserRole = UserRole.VALIDATOR,
  ) {
    const result = await this.validateTicket(
      qrToken,
      validatorId,
      attemptedEventId,
      validatorRole,
    );
    if (!result.ticketId) {
      return { ...result, details: null }; // NOT_FOUND
    }
    const [d] = await this.dataSource.query(
      `SELECT t.ticket_number, t.checked_in_at, tt.type_name,
              e.title AS event_title, u.full_name, u.email
       FROM tickets t
       JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
       JOIN events e ON e.event_id = t.event_id
       LEFT JOIN users u ON u.user_id = t.customer_id
       WHERE t.ticket_id = $1`,
      [result.ticketId],
    );
    return {
      ...result,
      details: d
        ? {
            ticketNumber: d.ticket_number,
            ticketType: d.type_name,
            eventTitle: d.event_title,
            checkedInAt: d.checked_in_at,
            customer: d.full_name
              ? { name: d.full_name, email: d.email }
              : null,
          }
        : null,
    };
  }

  /**
   * Ties one purchased ticket to a verified PayChangu payment. A payment is bound
   * to the first buyer / event / ticket type that uses it and can only be used for
   * as many tickets as the amount paid covers (the frontend buys one ticket per call).
   */
  private async useVerifiedPayment(
    m: EntityManager,
    claim: {
      txRef: string;
      userId: string;
      eventId: string;
      ticketTypeId: string;
      unitPrice: string | number;
      currency: string;
      paid: VerifiedPayChanguPayment;
    },
  ): Promise<void> {
    await m.query(
      `INSERT INTO ticket_payment_claims
         (tx_ref, customer_id, event_id, ticket_type_id, amount, currency, provider_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tx_ref) DO NOTHING`,
      [
        claim.txRef,
        claim.userId,
        claim.eventId,
        claim.ticketTypeId,
        claim.paid.amount,
        claim.paid.currency || 'MWK',
        claim.paid.reference,
      ],
    );

    const rows: {
      customer_id: string;
      event_id: string;
      ticket_type_id: string;
      amount: string;
      currency: string;
      tickets_claimed: number;
    }[] = await m.query(
      `SELECT customer_id, event_id, ticket_type_id, amount, currency, tickets_claimed
       FROM ticket_payment_claims WHERE tx_ref = $1 FOR UPDATE`,
      [claim.txRef],
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('The payment could not be recorded');
    }
    if (String(row.customer_id) !== String(claim.userId)) {
      throw new ForbiddenException('This payment belongs to another account');
    }
    if (
      String(row.event_id) !== String(claim.eventId) ||
      String(row.ticket_type_id) !== String(claim.ticketTypeId)
    ) {
      throw new BadRequestException('This payment was made for a different ticket');
    }
    if (String(row.currency).trim() !== String(claim.currency).trim()) {
      throw new BadRequestException('The payment currency does not match the ticket price');
    }

    const unitCents = Math.round(Number(claim.unitPrice) * 100);
    const paidCents = Math.round(Number(row.amount) * 100);
    if ((Number(row.tickets_claimed) + 1) * unitCents > paidCents) {
      throw new ConflictException(
        'This payment has already been used for all the tickets it covers',
      );
    }

    await m.query(
      `UPDATE ticket_payment_claims
       SET tickets_claimed = tickets_claimed + 1 WHERE tx_ref = $1`,
      [claim.txRef],
    );
  }
}
