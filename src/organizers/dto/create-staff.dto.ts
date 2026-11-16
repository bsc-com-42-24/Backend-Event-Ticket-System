import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'Chikondi Banda', minLength: 2, maxLength: 150 })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'gate1.staff@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'Initial password the staff member signs in with.',
    minLength: 10,
    maxLength: 72,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(72)
  password: string;
}
