import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ScanQrDto {
  @ApiProperty({ example: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b' })
  @IsUUID()
  qrToken: string;
}