import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function fixAdminPassword() {
  try {
    console.log('Fixing admin password...');
    
    // Hash the new password
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update admin user with proper password
    const admin = await prisma.user.update({
      where: { email: 'admin@example.com' },
      data: { password: hashedPassword }
    });
    
    console.log('Admin password updated successfully!');
    console.log('New login credentials:');
    console.log('- Email: admin@example.com');
    console.log('- Password: admin123');
    
    // Also fix other existing users
    const otherUsers = await prisma.user.findMany({
      where: {
        password: '$2b$10$default.hash.for.existing.users'
      }
    });
    
    for (const user of otherUsers) {
      const userPassword = user.email === 'john@example.com' ? 'john123' : 
                          user.email === 'jane@example.com' ? 'jane123' : 'user123';
      const hashedUserPassword = await bcrypt.hash(userPassword, 10);
      
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedUserPassword }
      });
      
      console.log(`Updated ${user.email} with password: ${userPassword}`);
    }
    
  } catch (error) {
    console.error('Error fixing admin password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAdminPassword();
