import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.createMany({ data: [
    { username: 'JohnDoe', email: 'john@example.com', role: 'BIDDER', firstName: 'John', lastName: 'Doe' },
    { username: 'AdminUser', email: 'admin@example.com', role: 'ADMIN', firstName: 'Ada', lastName: 'Min' },
    { username: 'JaneSmith', email: 'jane@example.com', role: 'BUYER', firstName: 'Jane', lastName: 'Smith' },
  ], skipDuplicates: true });

  const john = await prisma.user.findUnique({ where: { email: 'john@example.com' } });
  const jane = await prisma.user.findUnique({ where: { email: 'jane@example.com' } });

  if (john && jane) {
    await prisma.product.createMany({ data: [
      { id: 'p1', title: 'Vintage Leather Jacket', description: 'Retro jacket', seller: 'JohnDoe', imageUrl: 'https://picsum.photos/seed/jacket/800/600', category: 'Fashion', condition: 'USED', location: 'NY', listingType: 'AUCTION', startingPrice: 50, currentPrice: 75.5, buyNowPrice: 150, endDate: new Date(Date.now() + 2*24*60*60*1000), userId: john.id },
      { id: 'p2', title: 'Ergonomic Office Chair', description: 'Comfy', seller: 'JaneSmith', imageUrl: 'https://picsum.photos/seed/chair/800/600', category: 'Furniture', condition: 'NEW', location: 'SF', listingType: 'FIXED_PRICE', startingPrice: 180, currentPrice: 180, endDate: new Date(Date.now() + 30*24*60*60*1000), userId: jane.id },
    ], skipDuplicates: true });
  }

  console.log('Seed complete');
}

main().finally(() => prisma.$disconnect());


