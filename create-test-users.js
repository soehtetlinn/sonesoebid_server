import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestUsers() {
  try {
    console.log('Creating test users...');
    
    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        username: 'admin',
        email: 'admin@example.com',
        password: adminPassword,
        role: 'ADMIN',
        firstName: 'Admin',
        lastName: 'User'
      }
    });
    console.log('Admin user created:', admin.email);

    // Create regular user
    const userPassword = await bcrypt.hash('user123', 10);
    const user = await prisma.user.upsert({
      where: { email: 'john@example.com' },
      update: {},
      create: {
        username: 'johndoe',
        email: 'john@example.com',
        password: userPassword,
        role: 'BUYER',
        firstName: 'John',
        lastName: 'Doe'
      }
    });
    console.log('Regular user created:', user.email);

    console.log('\nTest users created successfully!');
    console.log('Admin: admin@example.com / admin123');
    console.log('User: john@example.com / user123');
    
  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUsers();
