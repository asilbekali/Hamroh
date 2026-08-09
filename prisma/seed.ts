import { AttendanceStatus, PrismaClient, Region, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Admin123!';

/** Same credentials the app provisions on its first boot, see SuperAdminSeeder. */
const SUPER_ADMIN_PHONE = process.env.SUPER_ADMIN_PHONE ?? '+998900000000';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
const SUPER_ADMIN_FULL_NAME =
  process.env.SUPER_ADMIN_FULL_NAME ?? 'Bosh administrator';

/** Branches to provision, with how many demo participants each one gets. */
const BRANCHES = [
  {
    name: 'Samarqand filiali',
    region: Region.SAMARKAND,
    address: 'Samarqand sh., Registon koʻchasi 12',
    admin: { username: 'admin_samarqand', fullName: 'Aliyev Sardor Baxtiyorovich' },
    trainers: [
      { username: 'trener_samarqand_1', fullName: 'Qodirov Jasur Anvarovich' },
      { username: 'trener_samarqand_2', fullName: 'Yusupova Nilufar Akmalovna' },
    ],
    participantCount: 2,
  },
  {
    name: 'Toshkent shahar filiali',
    region: Region.TASHKENT_CITY,
    address: 'Toshkent sh., Amir Temur shoh koʻchasi 4',
    admin: { username: 'admin_toshkent', fullName: 'Karimov Bekzod Rustamovich' },
    trainers: [
      { username: 'trener_toshkent_1', fullName: 'Saidova Dilnoza Farhodovna' },
    ],
    participantCount: 2,
  },
  {
    name: 'Fargʻona filiali',
    region: Region.FERGANA,
    address: 'Fargʻona sh., Mustaqillik koʻchasi 27',
    admin: { username: 'admin_fargona', fullName: 'Toshmatov Otabek Ilhomovich' },
    trainers: [
      { username: 'trener_fargona_1', fullName: 'Mirzayev Sanjar Tohirovich' },
    ],
    participantCount: 2,
  },
];

const FIRST_NAMES = [
  'Dilnoza', 'Sardor', 'Nilufar', 'Jasur', 'Malika', 'Bekzod', 'Zilola',
  'Otabek', 'Shahnoza', 'Aziz', 'Gulnora', 'Rustam', 'Feruza', 'Sanjar',
  'Kamola', 'Ulugʻbek', 'Nodira', 'Islom', 'Mohira', 'Shohruh',
];

const LAST_NAMES = [
  'Aliyev', 'Karimov', 'Yusupov', 'Qodirov', 'Toshmatov', 'Mirzayev',
  'Saidov', 'Rahimov', 'Ergashev', 'Nazarov', 'Xolmatov', 'Ibragimov',
];

const MIDDLE_NAMES = [
  'Baxtiyorovich', 'Anvarovich', 'Rustamovich', 'Ilhomovich', 'Tohirovich',
];

const FEMALE_MIDDLE_NAMES = [
  'Baxtiyorovna', 'Anvarovna', 'Rustamovna', 'Ilhomovna', 'Tohirovna',
];

const FEMALE_FIRST_NAMES = new Set([
  'Dilnoza', 'Nilufar', 'Malika', 'Zilola', 'Shahnoza', 'Gulnora', 'Feruza',
  'Kamola', 'Nodira', 'Mohira',
]);

/** Deterministic pseudo-random so reseeding produces the same demo data. */
function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

function buildParticipant(branchId: string, createdById: string, index: number) {
  const firstName = pick(FIRST_NAMES, index * 7 + 3);
  const lastNameStem = pick(LAST_NAMES, index * 11 + 5);
  const isFemale = FEMALE_FIRST_NAMES.has(firstName);

  return {
    firstName,
    lastName: isFemale ? `${lastNameStem}a` : lastNameStem,
    middleName: isFemale
      ? pick(FEMALE_MIDDLE_NAMES, index * 3)
      : pick(MIDDLE_NAMES, index * 3),
    // Ages spread roughly between 8 and 47.
    birthDate: new Date(
      Date.UTC(1979 + (index % 40), index % 12, 1 + (index % 28)),
    ),
    phone: `+9989${String(10000000 + ((index * 137) % 89999999)).slice(0, 8)}`,
    address: `${1 + (index % 90)}-uy, ${pick(['Navoiy', 'Bogʻishamol', 'Chorsu', 'Yangiobod'], index)} koʻchasi`,
    branchId,
    createdById,
  };
}

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  const superAdmin = await prisma.user.upsert({
    where: { username: SUPER_ADMIN_PHONE },
    update: {},
    create: {
      username: SUPER_ADMIN_PHONE,
      password: await bcrypt.hash(SUPER_ADMIN_PASSWORD, SALT_ROUNDS),
      fullName: SUPER_ADMIN_FULL_NAME,
      role: Role.SUPER_ADMIN,
      phone: SUPER_ADMIN_PHONE,
    },
  });

  console.log(`Super admin ready: ${superAdmin.username}`);

  for (const definition of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { name: definition.name },
      update: {},
      create: {
        name: definition.name,
        region: definition.region,
        address: definition.address,
      },
    });

    const admin = await prisma.user.upsert({
      where: { username: definition.admin.username },
      update: { branchId: branch.id },
      create: {
        username: definition.admin.username,
        password: passwordHash,
        fullName: definition.admin.fullName,
        role: Role.ADMIN,
        branchId: branch.id,
      },
    });

    const trainers: { id: string }[] = [];
    for (const trainer of definition.trainers) {
      trainers.push(
        await prisma.user.upsert({
          where: { username: trainer.username },
          update: { branchId: branch.id },
          create: {
            username: trainer.username,
            password: passwordHash,
            fullName: trainer.fullName,
            role: Role.TRAINER,
            branchId: branch.id,
          },
        }),
      );
    }

    const existingParticipants = await prisma.participant.count({
      where: { branchId: branch.id },
    });

    if (existingParticipants === 0) {
      await prisma.participant.createMany({
        data: Array.from({ length: definition.participantCount }, (_, index) =>
          buildParticipant(branch.id, admin.id, index),
        ),
      });
    }

    const activityCount = await prisma.activity.count({
      where: { branchId: branch.id },
    });

    if (activityCount === 0) {
      // Odd weekdays at midday, plus an evening group for the second trainer.
      await prisma.activity.create({
        data: {
          title: `${definition.name} — ertalabki mashgʻulot`,
          description: 'Haftaning toq kunlari oʻtkaziladigan umumiy mashgʻulot',
          // Friday deliberately runs later, to exercise per-weekday times.
          slots: {
            create: [
              { weekday: 1, startTime: '12:00', durationMinutes: 90 },
              { weekday: 3, startTime: '12:00', durationMinutes: 90 },
              { weekday: 5, startTime: '16:00', durationMinutes: 90 },
            ],
          },
          startDate: new Date(Date.UTC(2026, 0, 5)),
          capacity: 30,
          branchId: branch.id,
          trainerId: trainers[0]?.id,
          createdById: admin.id,
        },
      });

      await prisma.activity.create({
        data: {
          title: `${definition.name} — kechki guruh`,
          slots: {
            create: [
              { weekday: 2, startTime: '17:30', durationMinutes: 60 },
              { weekday: 4, startTime: '17:30', durationMinutes: 60 },
              { weekday: 6, startTime: '10:00', durationMinutes: 60 },
            ],
          },
          startDate: new Date(Date.UTC(2026, 0, 6)),
          capacity: 20,
          branchId: branch.id,
          trainerId: trainers[1]?.id ?? trainers[0]?.id,
          createdById: admin.id,
        },
      });
    }

    console.log(
      `${branch.name}: admin ${admin.username}, ${definition.trainers.length} trainer(s), ${definition.participantCount} participants`,
    );
  }

  await seedSampleAttendance();
  await seedAnnouncement(superAdmin.id);

  console.log(`\nAll accounts use the password: ${DEFAULT_PASSWORD}`);
}

/** Marks one past session per activity so the reports have something to show. */
async function seedSampleAttendance() {
  const existing = await prisma.attendance.count();
  if (existing > 0) {
    return;
  }

  const activities = await prisma.activity.findMany({
    select: {
      id: true,
      branchId: true,
      startDate: true,
      slots: { select: { weekday: true } },
    },
  });

  for (const activity of activities) {
    const date = new Date(activity.startDate);
    // Walk forward to the first day that matches the schedule.
    for (let step = 0; step < 7; step += 1) {
      const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      if (activity.slots.some((slot) => slot.weekday === isoDay)) {
        break;
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }

    const participants = await prisma.participant.findMany({
      where: { branchId: activity.branchId },
      take: 12,
      select: { id: true },
    });

    await prisma.attendance.createMany({
      data: participants.map((participant, index) => ({
        activityId: activity.id,
        participantId: participant.id,
        date,
        status: index % 5 === 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
      })),
      skipDuplicates: true,
    });
  }
}

async function seedAnnouncement(superAdminId: string) {
  const existing = await prisma.announcement.count();
  if (existing > 0) {
    return;
  }

  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    select: { id: true, fullName: true },
  });

  await prisma.announcement.create({
    data: {
      title: 'Yangi oʻquv mavsumiga tayyorgarlik',
      body: 'Barcha filiallar sentabr oyi boshigacha quyidagi vazifalarni bajarishi kerak.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      authorId: superAdminId,
      todos: {
        create: admins.map((admin, index) => ({
          title: `Ishtirokchilar roʻyxatini tekshirish — ${admin.fullName}`,
          description: 'Telefon raqamlari va manzillarni yangilang',
          assigneeId: admin.id,
          position: index,
        })),
      },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
