import { BadRequestException, Injectable } from '@nestjs/common';
import jsQR from 'jsqr';
import * as QRCode from 'qrcode';
import sharp from 'sharp';

@Injectable()
export class QrCodeService {
  async generateQrCode(text: string): Promise<string> {
    try {
      // Generate a QR code as a data URL
      return await QRCode.toDataURL(text);
    } catch (err) {
      throw new Error('Failed to generate QR code: ' + err);
    }
  }

  async decodeQrCode(image: Buffer): Promise<string> {
    let data: Buffer;
    let width: number;
    let height: number;
    try {
      const pixels = await sharp(image, { limitInputPixels: 25_000_000 })
        .rotate()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      data = pixels.data;
      width = pixels.info.width;
      height = pixels.info.height;
    } catch {
      throw new BadRequestException(
        'The uploaded file is not a supported or readable image.',
      );
    }

    const qrCode = jsQR(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      width,
      height,
      { inversionAttempts: 'attemptBoth' },
    );
    if (!qrCode) {
      throw new BadRequestException(
        'No readable QR code was found in the image.',
      );
    }

    return qrCode.data;
  }
}
