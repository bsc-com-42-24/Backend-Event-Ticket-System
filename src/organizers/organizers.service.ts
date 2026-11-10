import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { UserRole } from '../users/user-role.enum';
import { User } from '../users/user.entity';
import { CreateStaffDto } from './dto/create-staff.dto';

const BCRYPT_SALT_ROUNDS = 12;
const BCRYPT_MAX_PASSWORD_BYTES = 72;

export interface StaffEventSummary {
  eventId: string;
  title: string;
}

export interface StaffMember {
  staffId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  events: StaffEventSummary[];
}

interface StaffRow {
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  events: StaffEventSummary[] | null;
}

/** Minimal shape both DataSource and EntityManager share for raw queries. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

@Injectable()
export class OrganizersService {
  constructor(private readonly dataSource: DataSource) {}

  /** Creates a CHECK_IN_STAFF account owned by this organizer. */
  async createStaff(
    organizerId: string,
    input: CreateStaffDto,
  ): Promise<StaffMember> {
    if (Buffer.byteLength(input.password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
      throw new BadRequestException('Password is too long');
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    try {
      // One transaction: the account and its ownership record both exist or
      // neither does.
      const staffId = await this.dataSource.transaction(async (manager) => {
        const user = await manager.save(
          manager.create(User, {
            name: input.name.trim(),
            email,
            passwordHash,
            role: UserRole.VALIDATOR,
            isActive: true,
          }),
        );
        await manager.query(
          `INSERT INTO organizer_staff (staff_id, organizer_id) VALUES ($1, $2)`,
          [user.id, organizerId],
        );
        return user.id;
      });

      return await this.getOwnedStaff(this.dataSource, organizerId, staffId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  /** Lists the staff this organizer created, with their assigned events. */
  async listStaff(organizerId: string): Promise<StaffMember[]> {
    const rows = await this.queryStaff(this.dataSource, organizerId);
    return rows.map((row) => this.toStaffMember(row));
  }

  /**
   * Replaces the set of events the staff member may validate tickets for.
   * Every event must belong to this organizer.
   */
  async assignEvents(
    organizerId: string,
    staffId: string,
    eventIds: string[],
  ): Promise<StaffMember> {
    const uniqueIds = [...new Set(eventIds)];

    await this.dataSource.transaction(async (manager) => {
      await this.lockOwnedStaff(manager, organizerId, staffId);

      if (uniqueIds.length > 0) {
        const owned: { event_id: string }[] = await manager.query(
          `SELECT event_id FROM events
           WHERE organizer_id = $1 AND event_id = ANY($2::bigint[])`,
          [organizerId, uniqueIds],
        );
        if (owned.length !== uniqueIds.length) {
          throw new BadRequestException(
            'One or more events were not found among your events',
          );
        }
      }

      await manager.query(
        `DELETE FROM staff_event_assignments WHERE staff_id = $1`,
        [staffId],
      );
      if (uniqueIds.length > 0) {
        await manager.query(
          `INSERT INTO staff_event_assignments (staff_id, event_id)
           SELECT $1, UNNEST($2::bigint[])`,
          [staffId, uniqueIds],
        );
      }
    });

    return this.getOwnedStaff(this.dataSource, organizerId, staffId);
  }

  /**
   * Enables or disables the staff account. A disabled account cannot sign in,
   * its existing tokens are rejected, and it cannot validate tickets.
   */
  async setActive(
    organizerId: string,
    staffId: string,
    isActive: boolean,
  ): Promise<StaffMember> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockOwnedStaff(manager, organizerId, staffId);
      await manager.query(
        `UPDATE users SET is_active = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [staffId, isActive],
      );
    });

    return this.getOwnedStaff(this.dataSource, organizerId, staffId);
  }

  /**
   * Removes the staff member from this organizer: assignments and the
   * ownership record are deleted and the account is disabled. The user row is
   * kept so tickets, orders and past validation history stay intact.
   */
  async removeStaff(organizerId: string, staffId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockOwnedStaff(manager, organizerId, staffId);

      await manager.query(
        `DELETE FROM staff_event_assignments WHERE staff_id = $1`,
        [staffId],
      );
      await manager.query(`DELETE FROM organizer_staff WHERE staff_id = $1`, [
        staffId,
      ]);
      await manager.query(
        `UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [staffId],
      );
    });
  }

  /** 404 unless the staff member belongs to this organizer; locks the row. */
  private async lockOwnedStaff(
    manager: EntityManager,
    organizerId: string,
    staffId: string,
  ): Promise<void> {
    const rows: unknown[] = await manager.query(
      `SELECT staff_id FROM organizer_staff
       WHERE staff_id = $1 AND organizer_id = $2
       FOR UPDATE`,
      [staffId, organizerId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Staff member not found');
    }
  }

  private async getOwnedStaff(
    db: Queryable,
    organizerId: string,
    staffId: string,
  ): Promise<StaffMember> {
    const rows = await this.queryStaff(db, organizerId, staffId);
    if (rows.length === 0) {
      throw new NotFoundException('Staff member not found');
    }
    return this.toStaffMember(rows[0]);
  }

  private queryStaff(
    db: Queryable,
    organizerId: string,
    staffId?: string,
  ): Promise<StaffRow[]> {
    const params: unknown[] = [organizerId];
    let staffFilter = '';
    if (staffId !== undefined) {
      params.push(staffId);
      staffFilter = 'AND os.staff_id = $2';
    }

    return db.query(
      `SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              COALESCE(
                json_agg(
                  json_build_object('eventId', e.event_id::text, 'title', e.title)
                  ORDER BY e.event_id
                ) FILTER (WHERE e.event_id IS NOT NULL),
                '[]'::json
              ) AS events
       FROM organizer_staff os
       JOIN users u ON u.user_id = os.staff_id
       LEFT JOIN staff_event_assignments sea ON sea.staff_id = os.staff_id
       LEFT JOIN events e ON e.event_id = sea.event_id
                         AND e.organizer_id = os.organizer_id
       WHERE os.organizer_id = $1 ${staffFilter}
       GROUP BY u.user_id
       ORDER BY u.created_at DESC, u.user_id DESC`,
      params,
    );
  }

  private toStaffMember(row: StaffRow): StaffMember {
    return {
      staffId: String(row.user_id),
      name: row.full_name,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
      events: row.events ?? [],
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === '23505'
    );
  }
}
