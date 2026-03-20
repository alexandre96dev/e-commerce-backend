import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import Stripe from 'stripe';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {
    if (!process.env.STRIPE_SECRET_KEY) {
      this.logger.warn('STRIPE_SECRET_KEY nao configurada; pagamentos Stripe indisponiveis');
    }
  }

  private getStripeClient() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new ServiceUnavailableException('Gateway Stripe nao configurado');
    }
    if (!this.stripeClient) {
      this.stripeClient = new Stripe(stripeSecretKey);
    }
    return this.stripeClient;
  }

  async createCheckoutSession(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Pedido nao encontrado');
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map(
      (item) => ({
        quantity: item.quantity,
        price_data: {
          currency: order.currency,
          unit_amount: item.unitPriceCents,
          product_data: {
            name: item.nameSnapshot,
            metadata: {
              sku: item.skuSnapshot,
              productId: item.productId,
            },
          },
        },
      }),
    );

    let session: Stripe.Checkout.Session;
    try {
      const stripe = this.getStripeClient();
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        success_url: process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:3000/checkout/success',
        cancel_url: process.env.STRIPE_CANCEL_URL ?? 'http://localhost:3000/checkout/cancel',
        metadata: {
          orderId: order.id,
          userId,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao criar sessao Stripe: ${err}`);
      throw new ServiceUnavailableException('Gateway de pagamento indisponivel no momento');
    }

    if (!session.url) {
      this.logger.error(`Sessao Stripe criada sem URL: ${session.id}`);
      throw new ServiceUnavailableException('Gateway de pagamento nao retornou URL de checkout');
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });

    await this.prisma.payment.update({
      where: { orderId: order.id },
      data: { stripeSessionId: session.id },
    });

    return { checkoutUrl: session.url };
  }

  async handleStripeWebhook(signature: string | string[] | undefined, body: Buffer) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    const sig = Array.isArray(signature) ? signature[0] : signature;

    if (!secret || !sig) {
      throw new BadRequestException('Assinatura de webhook invalida');
    }

    let event: Stripe.Event;
    try {
      const stripe = this.getStripeClient();
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new BadRequestException('Assinatura de webhook invalida');
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.payment_failed'
    ) {
      await this.persistPaymentEvent(event);
    }

    return { received: true };
  }

  private async persistPaymentEvent(event: Stripe.Event) {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) {
        return;
      }

      let emailRecipient: string | null = null;
      let emailPaymentIntent: string | null = null;

      await this.prisma.$transaction(async (tx) => {
        const paymentUpdate = await tx.payment.updateMany({
          where: {
            orderId,
            status: { not: PaymentStatus.succeeded },
          },
          data: {
            status: PaymentStatus.succeeded,
            stripePaymentId: session.payment_intent?.toString() ?? null,
            rawPayload: event as unknown as object,
          },
        });

        // If no row was updated, this event was already processed.
        if (paymentUpdate.count === 0) {
          return;
        }

        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true, user: true },
        });
        if (!order) {
          return;
        }

        // Estoque ja foi decrementado na criacao do pedido (orders.service)

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.paid,
            stripePaymentId: session.payment_intent?.toString() ?? null,
          },
        });

        emailRecipient = order.user.email;
        emailPaymentIntent = session.payment_intent?.toString() ?? null;
      });

      if (emailRecipient) {
        this.mailService.sendTemplate(emailRecipient, 'payment_approved', {
          orderId,
          paymentIntent: emailPaymentIntent,
        }).catch((err) => this.logger.warn(`Falha ao enviar email de pagamento aprovado: ${err}`));
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const order = await this.prisma.order.findFirst({
        where: { stripePaymentId: intent.id },
      });

      if (!order) {
        return;
      }

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.failed },
        }),
        this.prisma.payment.update({
          where: { orderId: order.id },
          data: { status: PaymentStatus.failed, rawPayload: event as unknown as object },
        }),
      ]);

      this.prisma.user.findUnique({ where: { id: order.userId } }).then((user) => {
        if (user) {
          this.mailService.sendTemplate(user.email, 'payment_failed', {
            orderId: order.id,
            paymentIntent: intent.id,
          }).catch((err) => this.logger.warn(`Falha ao enviar email de pagamento recusado: ${err}`));
        }
      }).catch((err) => this.logger.warn(`Falha ao buscar usuario para email: ${err}`));
    }
  }
}
