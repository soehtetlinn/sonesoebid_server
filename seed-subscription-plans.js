import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSubscriptionPlans() {
  try {
    console.log('Seeding subscription plans...');
    
    // Check if plans already exist
    const existingPlans = await prisma.subscriptionPlan.count();
    if (existingPlans > 0) {
      console.log('Subscription plans already exist, skipping seed.');
      return;
    }
    
    const plans = [
      {
        name: 'Free',
        description: 'Basic features for getting started',
        price: 0,
        currency: 'USD',
        billingInterval: 'monthly',
        features: [
          'Up to 5 product listings',
          'Basic support',
          'Standard auction duration'
        ],
        maxProducts: 5,
        maxBids: 50,
        prioritySupport: false,
        analyticsAccess: false,
        customBranding: false,
        apiAccess: false,
        isActive: true
      },
      {
        name: 'Basic',
        description: 'Perfect for small sellers',
        price: 9.99,
        currency: 'USD',
        billingInterval: 'monthly',
        features: [
          'Up to 25 product listings',
          'Priority support',
          'Extended auction duration',
          'Basic analytics'
        ],
        maxProducts: 25,
        maxBids: 200,
        prioritySupport: true,
        analyticsAccess: true,
        customBranding: false,
        apiAccess: false,
        isActive: true
      },
      {
        name: 'Professional',
        description: 'For serious sellers and businesses',
        price: 29.99,
        currency: 'USD',
        billingInterval: 'monthly',
        features: [
          'Up to 100 product listings',
          'Priority support',
          'Unlimited auction duration',
          'Advanced analytics',
          'Custom branding',
          'API access'
        ],
        maxProducts: 100,
        maxBids: 1000,
        prioritySupport: true,
        analyticsAccess: true,
        customBranding: true,
        apiAccess: true,
        isActive: true
      },
      {
        name: 'Enterprise',
        description: 'For large businesses and high-volume sellers',
        price: 99.99,
        currency: 'USD',
        billingInterval: 'monthly',
        features: [
          'Unlimited product listings',
          '24/7 priority support',
          'Unlimited auction duration',
          'Advanced analytics dashboard',
          'Full custom branding',
          'Full API access',
          'Dedicated account manager'
        ],
        maxProducts: null, // Unlimited
        maxBids: null, // Unlimited
        prioritySupport: true,
        analyticsAccess: true,
        customBranding: true,
        apiAccess: true,
        isActive: true
      },
      {
        name: 'Basic Annual',
        description: 'Basic plan with annual billing (2 months free)',
        price: 99.99,
        currency: 'USD',
        billingInterval: 'yearly',
        features: [
          'Up to 25 product listings',
          'Priority support',
          'Extended auction duration',
          'Basic analytics',
          '2 months free'
        ],
        maxProducts: 25,
        maxBids: 200,
        prioritySupport: true,
        analyticsAccess: true,
        customBranding: false,
        apiAccess: false,
        isActive: true
      },
      {
        name: 'Professional Annual',
        description: 'Professional plan with annual billing (2 months free)',
        price: 299.99,
        currency: 'USD',
        billingInterval: 'yearly',
        features: [
          'Up to 100 product listings',
          'Priority support',
          'Unlimited auction duration',
          'Advanced analytics',
          'Custom branding',
          'API access',
          '2 months free'
        ],
        maxProducts: 100,
        maxBids: 1000,
        prioritySupport: true,
        analyticsAccess: true,
        customBranding: true,
        apiAccess: true,
        isActive: true
      }
    ];
    
    for (const plan of plans) {
      await prisma.subscriptionPlan.create({
        data: plan
      });
      console.log(`Created plan: ${plan.name}`);
    }
    
    console.log('Subscription plans seeded successfully!');
  } catch (error) {
    console.error('Error seeding subscription plans:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSubscriptionPlans();
