/**
 * Seed E2E test administrators — idempotent, safe for repeated execution.
 *
 * Creates 3 admins for integrated E2E testing:
 * - SUPER_ADMIN: full access
 * - FINANCE: read + export, no write
 * - OPERATOR: no finance access
 *
 * Uses bcrypt with same salt rounds as production seed.
 * Only runs when E2E_SEED=1 or NODE_ENV=test.
 *
 * Run: E2E_SEED=1 DATABASE_URL=... npx tsx backend/prisma/seed-e2e-admins.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!E2E_PASSWORD) {
  console.error('❌ E2E_ADMIN_PASSWORD environment variable is required.');
  console.error('   Set it to any test-only password (e.g. E2E_ADMIN_PASSWORD=test-pwd-123)');
  process.exit(1);
}

const E2E_ADMINS = [
  {
    email: 'e2e-superadmin@kaviar.test',
    name: 'E2E SuperAdmin',
    role: 'SUPER_ADMIN',
  },
  {
    email: 'e2e-finance@kaviar.test',
    name: 'E2E Finance',
    role: 'FINANCE',
  },
  {
    email: 'e2e-operator@kaviar.test',
    name: 'E2E Operator',
    role: 'OPERATOR',
  },
];

async function seedE2EAdmins() {
  if (process.env.NODE_ENV !== 'test' && process.env.E2E_SEED !== '1') {
    console.error('❌ Refusing to run: set NODE_ENV=test or E2E_SEED=1');
    process.exit(1);
  }

  // Safety: validate DATABASE_URL is local
  const dbUrl = process.env.DATABASE_URL || '';
  try {
    const parsed = new URL(dbUrl);
    const allowed = ['127.0.0.1', 'localhost', '[::1]', 'postgres'];
    if (!allowed.includes(parsed.hostname)) {
      console.error(`❌ DATABASE_URL hostname "${parsed.hostname}" is not local. Aborting.`);
      process.exit(1);
    }
  } catch {
    console.error('❌ Cannot parse DATABASE_URL. Aborting.');
    process.exit(1);
  }

  console.log('🔑 Seeding E2E administrators...');

  for (const admin of E2E_ADMINS) {
    const hashedPassword = await bcrypt.hash(E2E_PASSWORD, 12);
    await prisma.admins.upsert({
      where: { email: admin.email },
      update: { password: hashedPassword, role: admin.role, is_active: true, name: admin.name },
      create: {
        email: admin.email,
        name: admin.name,
        password: hashedPassword,
        role: admin.role,
        is_active: true,
        must_change_password: false,
      },
    });
    console.log(`  ✅ ${admin.role}: ${admin.email}`);
  }

  console.log('🎉 E2E admins seeded.');
}

seedE2EAdmins()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
