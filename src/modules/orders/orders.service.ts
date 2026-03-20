import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { CouponsService } from '../coupons/coupons.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly couponsService: CouponsService,
    private readonly mailService: MailService,
  ) {}

  async createFromCart(userId: string, dto: CreateOrderDto) {
    const cart = await this.cartService.getCart(userId);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Carrinho vazio');
    }

    let subtotal = 0;
    const products = await Promise.all(
      cart.items.map(async (item) => {
        const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
        if (!product || !product.isActive) {
          throw new BadRequestException('Produto invalido no carrinho');
        }
        if (item.quantity > product.stock) {
          throw new BadRequestException('Estoque insuficiente para ' + product.name);
        }

        const unit = product.promoPriceCents ?? product.priceCents;
        const total = unit * item.quantity;
        subtotal += total;

        return { product, unit, quantity: item.quantity, total };
      }),
    );

    let couponId: string | undefined;
    let discount = 0;

    if (dto.couponCode) {
      const coupon = await this.couponsService.validateCoupon(dto.couponCode, subtotal);
      couponId = coupon.id;
      discount = this.couponsService.calculateDiscount(coupon, subtotal);
    }

    const shipping = 0;
    const total = Math.max(subtotal - discount + shipping, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId,
          addressId: dto.addressId,
          couponId,
          subtotalCents: subtotal,
          discountCents: discount,
          shippingCents: shipping,
          totalCents: total,
          currency: 'brl',
          status: OrderStatus.pending,
          items: {
            create: products.map((item) => ({
              productId: item.product.id,
              nameSnapshot: item.product.name,
              skuSnapshot: item.product.sku,
              unitPriceCents: item.unit,
              quantity: item.quantity,
              totalPriceCents: item.total,
            })),
          },
        },
        include: { items: true },
      });

      // Reserva de estoque (BUG-008)
      for (const item of products) {
        await tx.product.update({
          where: { id: item.product.id },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // Incrementa usedCount do cupom (BUG-005)
      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          provider: 'stripe',
          status: PaymentStatus.pending,
          amountCents: total,
          currency: 'brl',
        },
      });

      // Limpar carrinho apos pedido criado
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return createdOrder;
    });

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await this.mailService.sendTemplate(user.email, 'order_received', {
          orderId: order.id,
          totalCents: order.totalCents,
        });
      }
    } catch (err) {
      this.logger.warn(`Falha ao enviar email de pedido recebido: ${err}`);
    }

    return order;
  }

  myOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: { slug: true, name: true } },
          },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Pedido nao encontrado');
    }

    return order;
  }
}
