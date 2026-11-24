import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventStatus } from '../events/enums/event-status.enum';
import { NumericIdPipe } from '../events/pipes/numeric-id.pipe';
import { UserRole } from '../users/user-role.enum';

export class ModerateEventStatusDto {
  @ApiProperty({ enum: EventStatus, example: EventStatus.PUBLISHED })
  @IsEnum(EventStatus)
  status: EventStatus;

  @ApiPropertyOptional({ example: 'Approved after policy review' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewKycDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ example: 'Documents verified' })
  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@ApiForbiddenResponse({ description: 'Admin access only.' })
export class AdminController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('events')
  @ApiOperation({ summary: 'List all events across all statuses for moderation' })
  async getAllEvents(@Query('status') status?: string) {
    if (status) {
      return this.dataSource.query(
        `SELECT e.event_id AS "eventId", e.organizer_id AS "organizerId", u.full_name AS "organizerName",
                e.title, e.venue, e.location, e.start_at AS "startAt", e.end_at AS "endAt",
                e.capacity, e.tickets_issued AS "ticketsIssued", e.status, e.created_at AS "createdAt"
         FROM events e
         JOIN users u ON u.user_id = e.organizer_id
         WHERE e.status = $1
         ORDER BY e.created_at DESC`,
        [status.toUpperCase()],
      );
    }

    return this.dataSource.query(
      `SELECT e.event_id AS "eventId", e.organizer_id AS "organizerId", u.full_name AS "organizerName",
              e.title, e.venue, e.location, e.start_at AS "startAt", e.end_at AS "endAt",
              e.capacity, e.tickets_issued AS "ticketsIssued", e.status, e.created_at AS "createdAt"
       FROM events e
       JOIN users u ON u.user_id = e.organizer_id
       ORDER BY e.created_at DESC`,
    );
  }

  @Patch('events/:id/status')
  @ApiOperation({ summary: 'Approve, publish, draft (unpublish), or cancel any event' })
  async updateEventStatus(
    @Param('id', NumericIdPipe) id: string,
    @Body() dto: ModerateEventStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const publishedAtSql = dto.status === EventStatus.PUBLISHED ? ', published_at = COALESCE(published_at, CURRENT_TIMESTAMP)' : '';
    const cancelledAtSql = dto.status === EventStatus.CANCELLED ? ', cancelled_at = CURRENT_TIMESTAMP' : '';

    const rows = await this.dataSource.query(
      `UPDATE events
       SET status = $1, updated_at = CURRENT_TIMESTAMP ${publishedAtSql} ${cancelledAtSql}
       WHERE event_id = $2
       RETURNING event_id AS "eventId", title, status, published_at AS "publishedAt", cancelled_at AS "cancelledAt"`,
      [dto.status, id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('The requested event could not be found.');
    }

    await this.dataSource.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'EVENT_STATUS_MODERATED', 'EVENT', $2, $3::jsonb)`,
      [admin.userId, id, JSON.stringify({ status: dto.status, reason: dto.reason ?? null })],
    );

    return rows[0];
  }

  @Get('kyc')
  @ApiOperation({ summary: 'List all organizer KYC submissions' })
  async listKycSubmissions() {
    return this.dataSource.query(
      `SELECT k.kyc_id AS "kycId", k.organizer_id AS "organizerId", u.full_name AS "organizerName",
              u.email AS "organizerEmail", k.business_name AS "businessName",
              k.registration_number AS "registrationNumber", k.document_type AS "documentType",
              k.document_url AS "documentUrl", k.status, k.submitted_at AS "submittedAt"
       FROM organizer_kyc k
       JOIN users u ON u.user_id = k.organizer_id
       ORDER BY k.submitted_at DESC`,
    );
  }

  @Patch('kyc/:organizerId/review')
  @ApiOperation({ summary: 'Approve or reject an organizer KYC submission' })
  async reviewKyc(
    @Param('organizerId', NumericIdPipe) organizerId: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const status = dto.approved ? 'APPROVED' : 'REJECTED';

    const rows = await this.dataSource.query(
      `UPDATE organizer_kyc
       SET status = $1, reviewer_notes = $2, reviewed_at = CURRENT_TIMESTAMP
       WHERE organizer_id = $3
       RETURNING kyc_id AS "kycId", organizer_id AS "organizerId", status, reviewed_at AS "reviewedAt"`,
      [status, dto.notes ?? null, organizerId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('KYC submission not found for this organizer');
    }

    await this.dataSource.query(
      `UPDATE users SET is_verified = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [dto.approved, organizerId],
    );

    await this.dataSource.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'KYC_REVIEWED', 'ORGANIZER_KYC', $2, $3::jsonb)`,
      [admin.userId, organizerId, JSON.stringify({ approved: dto.approved, notes: dto.notes ?? null })],
    );

    return rows[0];
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Retrieve system audit logs for the Admin Audit tab' })
  async getAuditLogs(@Query('limit') limit = '100') {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    return this.dataSource.query(
      `SELECT a.audit_id AS "auditId", a.actor_user_id AS "actorUserId",
              u.full_name AS "actorName", u.email AS "actorEmail",
              a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
              a.details, a.created_at AS "createdAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.user_id = a.actor_user_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
  }
}
