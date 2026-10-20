import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode'; 

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
}
