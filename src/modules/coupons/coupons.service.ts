import { BadRequestException, Injectable } from '@nestjs/common';
import { Coupon, CouponType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCoupon(code: string, subtotalCents: number): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Cupom invalido');
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('Cupom ainda nao iniciou');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new BadRequestException('Cupom expirado');
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Limite de uso do cupom atingido');
    }
    if (coupon.minOrderCents && subtotalCents < coupon.minOrderCents) {
      throw new BadRequestException('Valor minimo para cupom nao atingido');
    }

    return coupon;
  }

  calculateDiscount(coupon: Coupon, subtotalCents: number): number {
    if (coupon.type === CouponType.percent) {
      return Math.floor((subtotalCents * coupon.value) / 100);
    }
    return Math.min(coupon.value, subtotalCents);
  }
}
