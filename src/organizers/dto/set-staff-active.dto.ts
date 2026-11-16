import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetStaffActiveDto {
  @ApiProperty({
    description:
      'false disables the account (no sign-in, existing tokens stop working, no ticket validation); true re-enables it.',
  })
  @IsBoolean()
  isActive: boolean;
}
