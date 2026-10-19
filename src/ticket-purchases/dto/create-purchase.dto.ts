import { IsInt, IsPositive, Max } from 'class-validator';

export class CreatePurchaseDto {
  @IsInt()
  @IsPositive()
  ticketTypeId: number;

  @IsInt()
  @IsPositive()
  @Max(100)
  quantity: number;
}