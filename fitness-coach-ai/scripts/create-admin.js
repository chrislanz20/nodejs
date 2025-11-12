const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  console.log('Creating admin user...');

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log('Admin user already exists!');
    console.log('Email:', email);
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: 'Admin',
      role: 'admin',
    },
  });

  console.log('✅ Admin user created successfully!');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('\nYou can now login at http://localhost:3000/login');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
