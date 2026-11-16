import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitKycDto {
  @ApiProperty({ example: 'Zomba Live Events Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  businessName: string;

  @ApiPropertyOptional({ example: 'REG-2026-88412' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiProperty({ example: 'NATIONAL_ID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentType: string;

  @ApiProperty({ example: 'https://example.com' })
  @IsString()
  @IsNotEmpty()
  documentUrl: string;
}
