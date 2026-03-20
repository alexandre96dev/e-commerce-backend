import { Controller, Get, Query } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ path: 'coupons', version: '1' })
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Public()
  @Get('validate')
  async validate(@Query('code') code: string, @Query('subtotalCents') subtotalCents: string) {
    const coupon = await this.couponsService.validateCoupon(code, Number(subtotalCents));
    return { valid: true, coupon };
  }
}
