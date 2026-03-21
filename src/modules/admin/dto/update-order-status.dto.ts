import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['processing', 'shipped', 'delivered', 'canceled'])
  status!: 'processing' | 'shipped' | 'delivered' | 'canceled';

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
