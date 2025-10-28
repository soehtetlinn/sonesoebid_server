import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDropshipProducts() {
  console.log('🌱 Seeding dropshipping suppliers and products...');

  try {
    // Create suppliers
    const supplier1 = await prisma.dropshipSupplier.upsert({
      where: { name: 'AliExpress Global' },
      update: {},
      create: {
        name: 'AliExpress Global',
        type: 'ALIEXPRESS',
        websiteUrl: 'https://www.aliexpress.com',
        contactEmail: 'supplier@aliexpress.com',
        isActive: true,
        avgShippingDays: 15,
        rating: 4.5
      }
    });

    const supplier2 = await prisma.dropshipSupplier.upsert({
      where: { name: 'CJ Dropshipping' },
      update: {},
      create: {
        name: 'CJ Dropshipping',
        type: 'CJ_DROPSHIPPING',
        websiteUrl: 'https://cjdropshipping.com',
        contactEmail: 'support@cjdropshipping.com',
        isActive: true,
        avgShippingDays: 10,
        rating: 4.7
      }
    });

    console.log('✅ Suppliers created');

    // Sample products
    const products = [
      {
        title: 'Wireless Bluetooth Earbuds - Premium Sound Quality',
        description: 'High-quality wireless earbuds with noise cancellation, long battery life up to 24 hours with charging case. Perfect for music lovers and active lifestyle. Features touch controls, IPX7 waterproof rating, and crystal clear sound.',
        shortDescription: 'Premium wireless earbuds with 24hr battery',
        category: 'Electronics',
        supplierId: supplier1.id,
        supplierProductId: 'WBE-2024-001',
        supplierCost: 8.50,
        sellingPrice: 29.99,
        compareAtPrice: 49.99,
        stockQuantity: 150,
        images: [
          'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500',
          'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=500'
        ],
        tags: ['electronics', 'audio', 'wireless', 'bluetooth'],
        shippingCost: 0,
        estimatedShippingDays: '7-12 days',
        weight: 0.15,
        status: 'ACTIVE'
      },
      {
        title: 'Smart Watch Fitness Tracker with Heart Rate Monitor',
        description: 'Advanced smartwatch with fitness tracking, heart rate monitoring, sleep analysis, and 20+ sport modes. Water-resistant design with 7-day battery life. Compatible with iOS and Android. Track your health and stay connected.',
        shortDescription: 'Fitness smartwatch with health monitoring',
        category: 'Electronics',
        supplierId: supplier2.id,
        supplierProductId: 'SW-FIT-789',
        supplierCost: 15.00,
        sellingPrice: 49.99,
        compareAtPrice: 79.99,
        stockQuantity: 200,
        images: [
          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
          'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=500'
        ],
        tags: ['smartwatch', 'fitness', 'health', 'wearable'],
        shippingCost: 0,
        estimatedShippingDays: '7-10 days',
        weight: 0.08,
        status: 'ACTIVE'
      },
      {
        title: 'Portable Phone Charger 20000mAh Power Bank',
        description: 'High-capacity portable charger with fast charging technology. Charge multiple devices simultaneously with 2 USB ports and 1 USB-C port. LED display shows remaining battery. Perfect for travel and emergencies.',
        shortDescription: '20000mAh fast charging power bank',
        category: 'Electronics',
        supplierId: supplier1.id,
        supplierProductId: 'PB-20K-456',
        supplierCost: 12.00,
        sellingPrice: 34.99,
        compareAtPrice: 54.99,
        stockQuantity: 180,
        images: [
          'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500',
          'https://images.unsplash.com/photo-1606816321674-3e9cf6b43388?w=500'
        ],
        tags: ['powerbank', 'charger', 'portable', 'battery'],
        shippingCost: 0,
        estimatedShippingDays: '8-15 days',
        weight: 0.45,
        status: 'ACTIVE'
      },
      {
        title: 'LED Desk Lamp with USB Charging Port - Eye Care',
        description: 'Modern LED desk lamp with adjustable brightness and color temperature. Built-in USB charging port for your devices. Eye-care technology reduces eye strain. Perfect for studying, reading, or working. Touch control and sleek design.',
        shortDescription: 'Adjustable LED desk lamp with USB port',
        category: 'Home & Living',
        supplierId: supplier2.id,
        supplierProductId: 'LAMP-LED-123',
        supplierCost: 10.50,
        sellingPrice: 32.99,
        compareAtPrice: 49.99,
        stockQuantity: 120,
        images: [
          'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500',
          'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=500'
        ],
        tags: ['lamp', 'led', 'desk', 'lighting'],
        shippingCost: 0,
        estimatedShippingDays: '7-10 days',
        weight: 0.65,
        status: 'ACTIVE'
      },
      {
        title: 'Stainless Steel Water Bottle - Insulated 750ml',
        description: 'Premium insulated water bottle keeps drinks cold for 24 hours or hot for 12 hours. Made from food-grade stainless steel. Leak-proof design with wide mouth for easy filling and cleaning. BPA-free and eco-friendly.',
        shortDescription: '750ml insulated stainless steel bottle',
        category: 'Home & Living',
        supplierId: supplier1.id,
        supplierProductId: 'WB-750-SS',
        supplierCost: 7.00,
        sellingPrice: 24.99,
        compareAtPrice: 39.99,
        stockQuantity: 250,
        images: [
          'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500',
          'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=500'
        ],
        tags: ['bottle', 'water', 'insulated', 'eco-friendly'],
        shippingCost: 0,
        estimatedShippingDays: '10-15 days',
        weight: 0.35,
        status: 'ACTIVE'
      },
      {
        title: 'Yoga Mat - Non-Slip Exercise Mat with Carrying Strap',
        description: 'Premium quality yoga mat with superior grip and cushioning. 6mm thickness provides comfort and support. Non-toxic, latex-free material. Comes with carrying strap for easy transport. Perfect for yoga, pilates, and floor exercises.',
        shortDescription: 'Non-slip yoga mat with carrying strap',
        category: 'Sports & Fitness',
        supplierId: supplier2.id,
        supplierProductId: 'YOGA-MAT-6MM',
        supplierCost: 8.00,
        sellingPrice: 27.99,
        compareAtPrice: 44.99,
        stockQuantity: 160,
        images: [
          'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=500',
          'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=500'
        ],
        tags: ['yoga', 'fitness', 'exercise', 'mat'],
        shippingCost: 0,
        estimatedShippingDays: '7-12 days',
        weight: 1.2,
        status: 'ACTIVE'
      },
      {
        title: 'Wireless Phone Charger Pad - Fast Charging 15W',
        description: 'Fast wireless charging pad compatible with all Qi-enabled devices. 15W output for quick charging. Slim design with LED indicator. Built-in safety features prevent overheating and overcharging. Case-friendly design.',
        shortDescription: '15W fast wireless charging pad',
        category: 'Electronics',
        supplierId: supplier1.id,
        supplierProductId: 'WC-15W-PAD',
        supplierCost: 6.50,
        sellingPrice: 22.99,
        compareAtPrice: 35.99,
        stockQuantity: 220,
        images: [
          'https://images.unsplash.com/photo-1591290619762-5a1b2d26e1f5?w=500',
          'https://images.unsplash.com/photo-1593642702909-dec73df255d7?w=500'
        ],
        tags: ['wireless', 'charger', 'fast-charging', 'qi'],
        shippingCost: 0,
        estimatedShippingDays: '8-12 days',
        weight: 0.12,
        status: 'ACTIVE'
      },
      {
        title: 'Backpack Laptop Bag - Water Resistant with USB Port',
        description: 'Stylish and functional laptop backpack with multiple compartments. Fits up to 15.6" laptops. Water-resistant material protects your belongings. Built-in USB charging port for convenience. Padded shoulder straps for comfort.',
        shortDescription: 'Water-resistant laptop backpack with USB',
        category: 'Bags & Accessories',
        supplierId: supplier2.id,
        supplierProductId: 'BP-LAPTOP-156',
        supplierCost: 14.00,
        sellingPrice: 39.99,
        compareAtPrice: 59.99,
        stockQuantity: 140,
        images: [
          'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500',
          'https://images.unsplash.com/photo-1581605405669-fcdf81165afa?w=500'
        ],
        tags: ['backpack', 'laptop-bag', 'travel', 'usb'],
        shippingCost: 0,
        estimatedShippingDays: '7-10 days',
        weight: 0.85,
        status: 'ACTIVE'
      },
      {
        title: 'Bluetooth Speaker - Portable Waterproof with 12H Battery',
        description: 'Compact portable Bluetooth speaker with powerful 360° sound. IPX7 waterproof rating perfect for outdoor use. 12-hour battery life. Built-in microphone for hands-free calls. Connects to multiple devices. Durable design.',
        shortDescription: 'Waterproof Bluetooth speaker 12hr battery',
        category: 'Electronics',
        supplierId: supplier1.id,
        supplierProductId: 'BT-SPK-360',
        supplierCost: 11.00,
        sellingPrice: 36.99,
        compareAtPrice: 54.99,
        stockQuantity: 190,
        images: [
          'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=500',
          'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500'
        ],
        tags: ['speaker', 'bluetooth', 'waterproof', 'portable'],
        shippingCost: 0,
        estimatedShippingDays: '8-14 days',
        weight: 0.55,
        status: 'ACTIVE'
      },
      {
        title: 'Phone Ring Holder Stand - 360° Rotation Grip',
        description: 'Universal phone ring holder with 360° rotation and 180° flip. Strong adhesive sticks to any phone or case. Can be used as a stand for hands-free viewing. Slim design won\'t add bulk. Compatible with magnetic car mounts.',
        shortDescription: '360° rotating phone ring holder',
        category: 'Phone Accessories',
        supplierId: supplier2.id,
        supplierProductId: 'RING-360-GRIP',
        supplierCost: 2.50,
        sellingPrice: 9.99,
        compareAtPrice: 14.99,
        stockQuantity: 500,
        images: [
          'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=500',
          'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=500'
        ],
        tags: ['phone-ring', 'holder', 'stand', 'grip'],
        shippingCost: 0,
        estimatedShippingDays: '10-15 days',
        weight: 0.03,
        status: 'ACTIVE'
      }
    ];

    // Create products
    for (const productData of products) {
      // Calculate profit
      const profitAmount = productData.sellingPrice - productData.supplierCost;
      const profitMargin = (profitAmount / productData.sellingPrice) * 100;

      // Generate slug
      const slug = productData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') + '-' + Math.random().toString(36).substring(2, 8);

      await prisma.dropshipProduct.create({
        data: {
          ...productData,
          slug,
          profitAmount,
          profitMargin,
          lastSyncedAt: new Date()
        }
      });

      console.log(`✅ Created: ${productData.title}`);
    }

    console.log('\n🎉 Successfully seeded dropshipping products!');
    console.log(`📦 Created ${products.length} products across 2 suppliers`);

  } catch (error) {
    console.error('❌ Error seeding products:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedDropshipProducts()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

