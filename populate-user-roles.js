import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function populateUserRoles() {
  try {
    console.log('Populating user roles for existing users...');
    
    // Get all users
    const users = await prisma.user.findMany({
      include: {
        userRoles: true
      }
    });
    
    console.log(`Found ${users.length} users`);
    
    for (const user of users) {
      // Check if user already has role assignments
      if (user.userRoles.length === 0) {
        console.log(`Adding role assignment for user ${user.username} (${user.email})`);
        
        // Create role assignment based on primary role
        await prisma.userRoleAssignment.create({
          data: {
            userId: user.id,
            role: user.role,
            assignedBy: null, // System assignment
            isActive: true
          }
        });
        
        console.log(`✓ Added ${user.role} role for ${user.username}`);
      } else {
        console.log(`User ${user.username} already has role assignments`);
      }
    }
    
    console.log('✅ User role population completed successfully!');
    
  } catch (error) {
    console.error('❌ Error populating user roles:', error);
  } finally {
    await prisma.$disconnect();
  }
}

populateUserRoles();
