import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCouponDto {
  @IsString()
  code!: string;

  @IsIn(['percent', 'fixed'])
  type!: 'percent' | 'fixed';

  @IsInt()
  @Min(1)
  @Max(100_000_00)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
