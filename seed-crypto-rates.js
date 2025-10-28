import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCryptoRates() {
  try {
    console.log('Seeding crypto exchange rates...');
    
    const rates = [
      { currency: 'BTC', usdRate: 45000, source: 'coingecko' },
      { currency: 'ETH', usdRate: 3000, source: 'coingecko' },
      { currency: 'USDT', usdRate: 1, source: 'coingecko' },
      { currency: 'USDC', usdRate: 1, source: 'coingecko' },
      { currency: 'BNB', usdRate: 300, source: 'coingecko' },
      { currency: 'ADA', usdRate: 0.5, source: 'coingecko' },
      { currency: 'SOL', usdRate: 100, source: 'coingecko' },
      { currency: 'MATIC', usdRate: 0.8, source: 'coingecko' },
      { currency: 'AVAX', usdRate: 25, source: 'coingecko' },
      { currency: 'DOT', usdRate: 6, source: 'coingecko' }
    ];
    
    for (const rate of rates) {
      await prisma.cryptoExchangeRate.create({
        data: {
          currency: rate.currency,
          usdRate: rate.usdRate,
          source: rate.source,
          lastUpdated: new Date()
        }
      });
      console.log(`Created rate: ${rate.currency} = $${rate.usdRate}`);
    }
    
    console.log('Crypto exchange rates seeded successfully!');
  } catch (error) {
    console.error('Error seeding crypto rates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedCryptoRates();
