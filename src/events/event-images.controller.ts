import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const uploadDir = (): string =>
  process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

interface UploadedImage {
  buffer: Buffer;
  size: number;
}

// The file type is decided from the first bytes of the file, never from the name or the
// Content-Type header the browser sent.
function detectExtension(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length > 12) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (
      buffer[0] === 0x89 &&
      buffer.subarray(1, 4).toString('ascii') === 'PNG'
    ) {
      return 'png';
    }
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'webp';
    }
  }
  return null;
}

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events/images')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EVENT_MANAGER, UserRole.ADMIN)
export class EventImagesController {
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Upload an event image (JPG, PNG or WEBP, up to 5 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }),
  )
  async upload(@UploadedFile() file?: UploadedImage) {
    if (!file) {
      throw new BadRequestException('Choose an image file to upload');
    }
    const extension = detectExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException('The image must be a JPG, PNG or WEBP file');
    }

    const name = `${randomUUID()}.${extension}`;
    await mkdir(uploadDir(), { recursive: true });
    await writeFile(join(uploadDir(), name), file.buffer);

    // store this path as the event's imageUrl
    return { imageUrl: `/uploads/${name}` };
  }
}
