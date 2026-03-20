import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['processing', 'shipped', 'delivered', 'canceled'])
  status!: 'processing' | 'shipped' | 'delivered' | 'canceled';
}
