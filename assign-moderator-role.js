const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function assignModeratorRole() {
  try {
    // Find a user to assign moderator role to (you can change the username)
    const username = process.argv[2] || 'admin'; // Default to 'admin' if no username provided
    
    const user = await prisma.user.findUnique({
      where: { username }
    });
    
    if (!user) {
      console.log(`User with username '${username}' not found.`);
      console.log('Available users:');
      const users = await prisma.user.findMany({
        select: { id: true, username: true, email: true, role: true }
      });
      users.forEach(u => console.log(`- ${u.username} (${u.email}) - Role: ${u.role}`));
      return;
    }
    
    console.log(`Found user: ${user.username} (${user.email}) - Current role: ${user.role}`);
    
    // Check if user already has MODERATOR role
    const existingAssignment = await prisma.userRoleAssignment.findUnique({
      where: {
        userId_role: {
          userId: user.id,
          role: 'MODERATOR'
        }
      }
    });
    
    if (existingAssignment) {
      console.log('User already has MODERATOR role assigned.');
      return;
    }
    
    // Assign MODERATOR role
    const assignment = await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        role: 'MODERATOR',
        assignedBy: user.id, // Self-assigned for now
        isActive: true
      }
    });
    
    console.log(`✅ Successfully assigned MODERATOR role to ${user.username}`);
    console.log(`Assignment ID: ${assignment.id}`);
    
    // Show all roles for this user
    const allRoles = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { role: true, assignedAt: true }
    });
    
    console.log(`\nAll active roles for ${user.username}:`);
    console.log(`- Primary role: ${user.role}`);
    allRoles.forEach(role => {
      console.log(`- Additional role: ${role.role} (assigned: ${role.assignedAt})`);
    });
    
  } catch (error) {
    console.error('Error assigning moderator role:', error);
  } finally {
    await prisma.$disconnect();
  }
}

assignModeratorRole();
