import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@hamroh.org').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      fullName: 'Hamroh Super Admin',
      email,
      password: await bcrypt.hash(password, 10),
      role: Role.SUPER_ADMIN,
    },
  });

  console.log(`Seeded super admin: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
