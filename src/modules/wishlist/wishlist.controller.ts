import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WishlistService } from './wishlist.service';

@Controller({ path: 'wishlist', version: '1' })
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.wishlistService.list(user.sub);
  }

  @Post()
  add(@CurrentUser() user: { sub: string }, @Body() body: { productId: string }) {
    return this.wishlistService.add(user.sub, body.productId);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: { sub: string }, @Param('productId') productId: string) {
    return this.wishlistService.remove(user.sub, productId);
  }
}
