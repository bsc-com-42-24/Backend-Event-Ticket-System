import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdminStaffDto {
  @ApiProperty({
    description: 'Active organizer who will own this staff account.',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  organizerId: string;

  @ApiProperty({ minLength: 2, maxLength: 150 })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 10, maxLength: 72 })
  @IsString()
  @MinLength(10)
  @MaxLength(72)
  password: string;
}
