import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MailService } from '../mail/mail.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminListQueryDto } from './dto/admin-list-query.dto';
import { Request } from 'express';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const [totalSales, orderCount, products, users, recentOrders] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: 'paid' },
        _sum: { totalCents: true },
      }),
      this.prisma.order.count(),
      this.prisma.product.count(),
      this.prisma.user.count(),
      this.prisma.order.findMany({
        include: { items: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      metrics: {
        totalSalesCents: totalSales._sum.totalCents ?? 0,
        orders: orderCount,
        products,
        users,
      },
      recentOrders,
    };
  }

  @Get('orders')
  async orders(@Query() query: AdminListQueryDto) {
    const where = {
      status: query.status as
        | 'pending'
        | 'paid'
        | 'failed'
        | 'canceled'
        | 'processing'
        | 'shipped'
        | 'delivered'
        | undefined,
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true, payment: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Patch('orders/:orderId/status')
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() body: UpdateOrderStatusDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const currentOrder = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!currentOrder) {
      throw new BadRequestException('Pedido nao encontrado');
    }

    const allowedTransitions: Record<string, string[]> = {
      pending: ['canceled'],
      paid: ['processing', 'canceled'],
      processing: ['shipped', 'canceled'],
      shipped: ['delivered'],
      delivered: [],
      canceled: [],
      failed: [],
    };

    if (currentOrder.status === body.status) {
      return currentOrder;
    }

    if (!allowedTransitions[currentOrder.status].includes(body.status)) {
      throw new BadRequestException(
        `Transicao invalida de ${currentOrder.status} para ${body.status}`,
      );
    }

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: body.status },
    });

    await this.logAudit(
      user.sub,
      'ORDER_STATUS_UPDATED',
      'order',
      order.id,
      { from: currentOrder.status, to: body.status },
      req,
    );

    if (body.status === 'shipped') {
      try {
        const orderUser = await this.prisma.user.findUnique({ where: { id: order.userId } });
        if (orderUser) {
          await this.mailService.sendTemplate(orderUser.email, 'order_shipped', {
            orderId: order.id,
          });
        }
      } catch {
        // Email e best-effort, nao bloqueia a transicao de status
      }
    }

    return order;
  }

  @Get('products')
  async listProducts(@Query() query: AdminListQueryDto) {
    const where = {
      name: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, brand: true, images: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post('products')
  async createProduct(
    @Body() body: CreateProductDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const existingSku = await this.prisma.product.findUnique({ where: { sku: body.sku } });
    if (existingSku) {
      throw new ConflictException(`Já existe um produto com o SKU "${body.sku}"`);
    }

    const baseSlug = slugify(body.name + '-' + body.sku);
    let slug = baseSlug;
    const existingSlug = await this.prisma.product.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${baseSlug}-${Date.now().toString(36)}`;
    }

    const created = await this.prisma.product.create({
      data: {
        name: body.name,
        slug,
        sku: body.sku,
        priceCents: body.priceCents,
        promoPriceCents: body.promoPriceCents,
        stock: body.stock,
        categoryId: body.categoryId,
        brandId: body.brandId,
        shortDescription: body.shortDescription,
        description: body.description,
        images: body.images?.length
          ? {
              create: body.images.map((img, idx) => ({
                url: img.url,
                alt: img.alt ?? '',
                position: idx,
              })),
            }
          : undefined,
      },
      include: { images: true },
    });

    await this.logAudit(
      user.sub,
      'PRODUCT_CREATED',
      'product',
      created.id,
      { name: created.name, sku: created.sku },
      req,
    );
    return created;
  }

  @Patch('products/:productId')
  async updateProduct(
    @Param('productId') productId: string,
    @Body() body: UpdateProductDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const updated = await this.prisma.product.update({ where: { id: productId }, data: body });
    await this.logAudit(user.sub, 'PRODUCT_UPDATED', 'product', updated.id, body, req);
    return updated;
  }

  @Delete('products/:productId')
  async deleteProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const updated = await this.prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await this.logAudit(user.sub, 'PRODUCT_DEACTIVATED', 'product', updated.id, undefined, req);
    return updated;
  }

  @Get('categories')
  listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('categories')
  async createCategory(
    @Body() body: CreateCategoryDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const created = await this.prisma.category.create({
      data: {
        name: body.name,
        slug: slugify(body.name),
        description: body.description,
        parentId: body.parentId,
      },
    });

    await this.logAudit(user.sub, 'CATEGORY_CREATED', 'category', created.id, { name: created.name }, req);
    return created;
  }

  @Patch('categories/:categoryId')
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateCategoryDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const updated = await this.prisma.category.update({ where: { id: categoryId }, data: body });
    await this.logAudit(user.sub, 'CATEGORY_UPDATED', 'category', updated.id, body, req);
    return updated;
  }

  @Delete('categories/:categoryId')
  async deleteCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const updated = await this.prisma.category.update({ where: { id: categoryId }, data: { isActive: false } });
    await this.logAudit(user.sub, 'CATEGORY_DEACTIVATED', 'category', updated.id, undefined, req);
    return updated;
  }

  @Get('coupons')
  async listCoupons(@Query() query: AdminListQueryDto) {
    const where = {
      code: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post('coupons')
  async createCoupon(
    @Body() body: CreateCouponDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    if (body.type === 'percent' && body.value > 100) {
      throw new BadRequestException('Cupom percentual não pode ter valor maior que 100');
    }

    const created = await this.prisma.coupon.create({
      data: {
        code: body.code.toUpperCase(),
        type: body.type,
        value: body.value,
        minOrderCents: body.minOrderCents,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    });

    await this.logAudit(user.sub, 'COUPON_CREATED', 'coupon', created.id, { code: created.code }, req);
    return created;
  }

  @Patch('coupons/:couponId')
  async updateCoupon(
    @Param('couponId') couponId: string,
    @Body() body: UpdateCouponDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    const updated = await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        isActive: body.isActive,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await this.logAudit(user.sub, 'COUPON_UPDATED', 'coupon', updated.id, body, req);
    return updated;
  }

  @Get('users')
  async listUsers(@Query() query: AdminListQueryDto) {
    const validRoles = ['customer', 'admin'] as const;
    const roleFilter = validRoles.includes(query.role as typeof validRoles[number])
      ? (query.role as 'customer' | 'admin')
      : undefined;

    const where = {
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ]
        : undefined,
      role: roleFilter,
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  @Post('users')
  async createUser(
    @Body() body: CreateUserDto,
    @CurrentUser() currentUser: { sub: string },
    @Req() req: Request,
  ) {
    const exists = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      throw new ConflictException(`Já existe um usuário com o email "${body.email}"`);
    }

    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash(body.password);

    const user = await this.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role ?? 'customer',
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await this.logAudit(currentUser.sub, 'USER_CREATED', 'user', user.id, {
      name: user.name,
      email: user.email,
      role: user.role,
    }, req);

    return user;
  }

  @Patch('users/:userId/role')
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() body: UpdateUserRoleDto,
    @CurrentUser() currentUser: { sub: string },
    @Req() req: Request,
  ) {
    if (userId === currentUser.sub) {
      throw new ForbiddenException('Voce nao pode alterar sua propria role');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      throw new BadRequestException('Usuario alvo nao encontrado');
    }

    if (targetUser.role === 'admin' && body.role === 'customer') {
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Nao e permitido remover o ultimo admin');
      }
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data: { role: body.role } });
    await this.logAudit(currentUser.sub, 'USER_ROLE_UPDATED', 'user', updated.id, {
      from: targetUser.role,
      to: updated.role,
    }, req);
    return updated;
  }

  @Get('audit-logs')
  async listAuditLogs(@Query() query: AdminListQueryDto) {
    const where = {
      action: query.action
        ? { contains: query.action, mode: 'insensitive' as const }
        : undefined,
      resource: query.resource
        ? { contains: query.resource, mode: 'insensitive' as const }
        : undefined,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async logAudit(
    actorId: string,
    action: string,
    resource: string,
    resourceId: string | null,
    metadata: unknown,
    req: Request,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        resource,
        resourceId: resourceId ?? undefined,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: metadata === undefined ? undefined : JSON.parse(JSON.stringify(metadata)),
      },
    });
  }
}
