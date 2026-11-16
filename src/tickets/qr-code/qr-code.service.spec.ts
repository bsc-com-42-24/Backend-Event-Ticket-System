import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as QRCode from 'qrcode';
import sharp from 'sharp';
import { QrCodeService } from './qr-code.service';

describe('QrCodeService', () => {
  let service: QrCodeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QrCodeService],
    }).compile();

    service = module.get<QrCodeService>(QrCodeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('decodes QR tokens from PNG images', async () => {
    const token = '7a3d3bb5-cf46-4c52-8acf-389ccadf440a';
    const image = await QRCode.toBuffer(token);

    await expect(service.decodeQrCode(image)).resolves.toBe(token);
  });

  it('rejects files that are not readable images', async () => {
    await expect(
      service.decodeQrCode(Buffer.from('not an image')),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects readable images without a QR code', async () => {
    const image = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    await expect(service.decodeQrCode(image)).rejects.toThrow(
      BadRequestException,
    );
  });
});
