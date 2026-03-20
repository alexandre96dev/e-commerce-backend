import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout/:orderId')
  checkout(@CurrentUser() user: { sub: string }, @Param('orderId') orderId: string) {
    return this.paymentsService.createCheckoutSession(orderId, user.sub);
  }

  @Public()
  @Post('webhook/stripe')
  webhook(@Headers('stripe-signature') signature: string, @Req() req: { rawBody: Buffer }) {
    return this.paymentsService.handleStripeWebhook(signature, req.rawBody);
  }
}
