import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser({ username, email, password, role, firstName, lastName }) {
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      role: role ?? 'BUYER',
      password: hashed,
    },
    create: {
      username,
      email,
      password: hashed,
      role: role ?? 'BUYER',
      firstName: firstName ?? null,
      lastName: lastName ?? null,
    },
  });
  return user;
}

async function createProductsFor(user, products) {
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id ?? 'missing' },
      update: {},
      create: {
        title: p.title,
        description: p.description ?? '',
        seller: user.username,
        imageUrl: p.imageUrl ?? 'https://picsum.photos/seed/new/800/600',
        category: p.category ?? 'General',
        condition: p.condition ?? 'NEW',
        location: p.location ?? 'NY',
        listingType: p.listingType ?? 'FIXED_PRICE',
        startingPrice: p.startingPrice ?? 10,
        currentPrice: p.currentPrice ?? p.startingPrice ?? 10,
        buyNowPrice: p.buyNowPrice ?? null,
        endDate: p.endDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: user.id,
      },
    }).catch(() => {
      // Ignore upsert error if id missing; fallback to create without fixed id
    });
  }
}

async function main() {
  // Users with passwords
  const admin = await upsertUser({
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'ADMIN',
    firstName: 'Admin',
    lastName: 'User',
  });

  const john = await upsertUser({
    username: 'johndoe',
    email: 'john@example.com',
    password: 'user123',
    role: 'BIDDER',
    firstName: 'John',
    lastName: 'Doe',
  });

  const jane = await upsertUser({
    username: 'janesmith',
    email: 'jane@example.com',
    password: 'user123',
    role: 'BUYER',
    firstName: 'Jane',
    lastName: 'Smith',
  });

  const now = Date.now();

  await createProductsFor(john, [
    {
      title: 'Vintage Leather Jacket',
      description: 'A classic 80s leather jacket in great condition.',
      imageUrl: 'https://picsum.photos/seed/jacket/800/600',
      category: 'Fashion',
      condition: 'USED',
      location: 'New York, NY',
      listingType: 'AUCTION',
      startingPrice: 50,
      currentPrice: 50,
      buyNowPrice: 150,
      endDate: new Date(now + 2 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Professional DSLR Camera Kit',
      description: 'Canon DSLR with lens, bag, tripod, and memory card.',
      imageUrl: 'https://picsum.photos/seed/camera/800/600',
      category: 'Electronics',
      condition: 'USED',
      location: 'Chicago, IL',
      listingType: 'AUCTION',
      startingPrice: 300,
      currentPrice: 300,
      buyNowPrice: 600,
      endDate: new Date(now + 23 * 60 * 60 * 1000),
    },
    {
      title: 'High-Performance Gaming Laptop',
      description: 'RTX 4080, 32GB RAM, 2TB SSD. Like new.',
      imageUrl: 'https://picsum.photos/seed/laptop/800/600',
      category: 'Electronics',
      condition: 'NEW',
      location: 'Austin, TX',
      listingType: 'AUCTION',
      startingPrice: 1500,
      currentPrice: 1500,
      buyNowPrice: 2400,
      endDate: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  ]);

  await createProductsFor(jane, [
    {
      title: 'Ergonomic Office Chair',
      description: 'Lumbar support, adjustable, very comfortable.',
      imageUrl: 'https://picsum.photos/seed/chair/800/600',
      category: 'Furniture',
      condition: 'NEW',
      location: 'San Francisco, CA',
      listingType: 'FIXED_PRICE',
      startingPrice: 180,
      currentPrice: 180,
      endDate: new Date(now + 30 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Antique Pocket Watch',
      description: 'Gold-plated, early 1900s, collector item.',
      imageUrl: 'https://picsum.photos/seed/watch/800/600',
      category: 'Collectibles',
      condition: 'USED',
      location: 'Boston, MA',
      listingType: 'AUCTION',
      startingPrice: 250,
      currentPrice: 250,
      endDate: new Date(now + 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Signed First Edition Novel',
      description: 'Rare signed first edition of a fantasy novel.',
      imageUrl: 'https://picsum.photos/seed/book/800/600',
      category: 'Books',
      condition: 'NEW',
      location: 'New York, NY',
      listingType: 'FIXED_PRICE',
      startingPrice: 115,
      currentPrice: 115,
      endDate: new Date(now + 21 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log('Seed complete: users and products ensured.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
}).finally(() => prisma.$disconnect());
