import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { SubmitKycDto } from './dto/submit-kyc.dto';

@ApiTags('Organizer KYC')
@ApiBearerAuth()
@Controller('organizers/me/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EVENT_MANAGER)
@ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
@ApiForbiddenResponse({ description: 'Only organizers may manage KYC.' })
export class OrganizerKycController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Submit or resubmit organizer KYC verification' })
  async submitKyc(
    @Body() dto: SubmitKycDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO organizer_kyc (organizer_id, business_name, registration_number, document_type, document_url, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', CURRENT_TIMESTAMP)
       ON CONFLICT (organizer_id) DO UPDATE SET
         business_name = EXCLUDED.business_name,
         registration_number = EXCLUDED.registration_number,
         document_type = EXCLUDED.document_type,
         document_url = EXCLUDED.document_url,
         status = 'PENDING',
         reviewer_notes = NULL,
         submitted_at = CURRENT_TIMESTAMP,
         reviewed_at = NULL
       RETURNING kyc_id AS "kycId", organizer_id AS "organizerId", business_name AS "businessName",
                 registration_number AS "registrationNumber", document_type AS "documentType",
                 document_url AS "documentUrl", status, submitted_at AS "submittedAt"`,
      [
        user.userId,
        dto.businessName.trim(),
        dto.registrationNumber?.trim() ?? null,
        dto.documentType.trim(),
        dto.documentUrl.trim(),
      ],
    );

    await this.dataSource.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'KYC_SUBMITTED', 'ORGANIZER_KYC', $2, $3::jsonb)`,
      [user.userId, String(rows[0].kycId), JSON.stringify({ businessName: dto.businessName })],
    );

    return rows[0];
  }

  @Get()
  @ApiOperation({ summary: 'Fetch current organizer KYC status and submission' })
  @ApiOkResponse({ description: 'KYC status object or unsubmitted state.' })
  async getMyKyc(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.dataSource.query(
      `SELECT k.kyc_id AS "kycId", k.business_name AS "businessName",
              k.registration_number AS "registrationNumber", k.document_type AS "documentType",
              k.document_url AS "documentUrl", k.status, k.reviewer_notes AS "reviewerNotes",
              k.submitted_at AS "submittedAt", k.reviewed_at AS "reviewedAt",
              u.is_verified AS "isVerified"
       FROM users u
       LEFT JOIN organizer_kyc k ON k.organizer_id = u.user_id
       WHERE u.user_id = $1`,
      [user.userId],
    );

    const record = rows[0];
    if (!record || !record.kycId) {
      return { status: 'NOT_SUBMITTED', isVerified: record?.isVerified ?? false };
    }
    return record;
  }
}
