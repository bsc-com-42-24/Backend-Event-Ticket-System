import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';

export class CreateContactDto {
  @ApiProperty({ example: 'Chikondi Banda' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'chikondi@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Ticket QR issue' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'I need help retrieving my event pass.' })
  @IsString()
  @IsNotEmpty()
  message: string;
}

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Submit a public contact/support message' })
  async submitContact(@Body() dto: CreateContactDto) {
    const rows = await this.dataSource.query(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING contact_id AS "contactId", created_at AS "createdAt"`,
      [dto.name.trim(), dto.email.trim().toLowerCase(), dto.subject.trim(), dto.message.trim()],
    );
    return {
      message: 'Your inquiry has been received.',
      ...rows[0],
    };
  }
}
