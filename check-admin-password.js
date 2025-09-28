import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function checkAdminPassword() {
  try {
    console.log('Checking admin user password...');
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        role: true
      }
    });
    
    if (admin) {
      console.log('Admin user found:', {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        passwordHash: admin.password
      });
      
      // Test password comparison
      const testPassword = 'changeme123';
      const isValid = await bcrypt.compare(testPassword, admin.password);
      console.log(`Password '${testPassword}' is valid:`, isValid);
      
      // Test with different passwords
      const testPasswords = ['admin123', 'password', 'changeme123', 'default'];
      for (const pwd of testPasswords) {
        const valid = await bcrypt.compare(pwd, admin.password);
        console.log(`Password '${pwd}' is valid:`, valid);
      }
    } else {
      console.log('Admin user not found');
    }
    
  } catch (error) {
    console.error('Error checking admin password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminPassword();
