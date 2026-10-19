import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Schema ids are BIGINT; keep them as strings and reject anything that is not a positive integer. */
@Injectable()
export class NumericIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[1-9]\d{0,17}$/.test(value)) {
      throw new BadRequestException('id must be a positive integer');
    }
    return value;
  }
}
