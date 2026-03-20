import { IsOptional, IsString } from 'class-validator';

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  addressId?: string;
}
