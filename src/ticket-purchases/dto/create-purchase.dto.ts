import { IsInt, IsPositive } from 'class-validator';

export class CreatePurchaseDto {
  @IsInt()
  @IsPositive()
  ticketTypeId: number;

  @IsInt()
  @IsPositive()
  quantity: number;
}