import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateOrderDto) {
    return this.ordersService.createFromCart(user.sub, dto);
  }

  @Get()
  myOrders(@CurrentUser() user: { sub: string }) {
    return this.ordersService.myOrders(user.sub);
  }

  @Get(':orderId')
  detail(@CurrentUser() user: { sub: string }, @Param('orderId') orderId: string) {
    return this.ordersService.detail(user.sub, orderId);
  }
}
