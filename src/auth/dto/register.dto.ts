import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

// ADMIN and CHECK_IN_STAFF (VALIDATOR) can never be self-assigned.
export const SELF_REGISTRATION_ROLES = [
  UserRole.CUSTOMER,
  UserRole.EVENT_MANAGER,
] as const;

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsIn(SELF_REGISTRATION_ROLES, {
    message: 'role must be ATTENDEE or ORGANIZER',
  })
  role?: UserRole;
}