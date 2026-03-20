import { PrismaClient, Role, CouponType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Admin@1234');

  await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: {},
    create: {
      email: 'admin@store.com',
      name: 'Admin',
      role: Role.admin,
      passwordHash,
    },
  });

  const electronics = await prisma.category.upsert({
    where: { slug: 'eletronicos' },
    update: {},
    create: {
      name: 'Eletronicos',
      slug: 'eletronicos',
      description: 'Produtos de tecnologia e gadgets',
      imageUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
    },
  });

  const home = await prisma.category.upsert({
    where: { slug: 'casa' },
    update: {},
    create: {
      name: 'Casa',
      slug: 'casa',
      description: 'Itens para casa e decoracao',
      imageUrl: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a',
    },
  });

  const brand = await prisma.brand.upsert({
    where: { slug: 'generica' },
    update: {},
    create: {
      name: 'Generica',
      slug: 'generica',
    },
  });

  const p1 = await prisma.product.upsert({
    where: { slug: 'fone-bluetooth-premium' },
    update: {},
    create: {
      name: 'Fone Bluetooth Premium',
      slug: 'fone-bluetooth-premium',
      sku: 'FONE-BT-001',
      shortDescription: 'Som de alta qualidade com cancelamento de ruido',
      description: 'Fone over-ear com bateria de longa duracao e conexao estavel.',
      priceCents: 59900,
      promoPriceCents: 49900,
      stock: 50,
      isFeatured: true,
      categoryId: electronics.id,
      brandId: brand.id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
            alt: 'Fone Bluetooth',
            position: 0,
          },
        ],
      },
      attributes: {
        create: [
          { key: 'cor', value: 'preto' },
          { key: 'conexao', value: 'bluetooth 5.3' },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: 'luminaria-minimalista' },
    update: {},
    create: {
      name: 'Luminaria Minimalista',
      slug: 'luminaria-minimalista',
      sku: 'CASA-LUZ-001',
      shortDescription: 'Design moderno para ambientes elegantes',
      description: 'Luminaria em metal com acabamento premium para sala e escritorio.',
      priceCents: 24900,
      stock: 35,
      categoryId: home.id,
      brandId: brand.id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1517999144091-3d9dca6d1e43',
            alt: 'Luminaria',
            position: 0,
          },
        ],
      },
      attributes: {
        create: [
          { key: 'material', value: 'metal' },
          { key: 'cor', value: 'dourado' },
        ],
      },
    },
  });

  await prisma.tag.upsert({
    where: { slug: 'destaque' },
    update: {},
    create: { name: 'Destaque', slug: 'destaque' },
  });

  const coupon = await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      type: CouponType.percent,
      value: 10,
      minOrderCents: 10000,
      maxUses: 100,
      isActive: true,
    },
  });

  const customerHash = await argon2.hash('Cliente@1234');
  const customer = await prisma.user.upsert({
    where: { email: 'cliente@store.com' },
    update: {},
    create: {
      email: 'cliente@store.com',
      name: 'Cliente Teste',
      role: Role.customer,
      passwordHash: customerHash,
    },
  });

  const cart = await prisma.cart.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id },
  });

  await prisma.cartItem.upsert({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: p1.id,
      },
    },
    update: { quantity: 1 },
    create: {
      cartId: cart.id,
      productId: p1.id,
      quantity: 1,
    },
  });

  console.log('Seed concluido com sucesso', { coupon: coupon.code });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
