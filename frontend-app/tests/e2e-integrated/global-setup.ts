/**
 * Global setup for integrated E2E tests.
 *
 * 1. Validates DATABASE_URL is safe (localhost + test DB name)
 * 2. Applies migrations via prisma migrate deploy
 * 3. Seeds admin users for testing
 * 4. Obtains auth tokens via real login endpoint
 * 5. Exports tokens to storageState or environment for tests
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test';
const JWT_SECRET = 'e2e-test-secret';
const BACKEND_PORT = 3003;
const BACKEND_BASE = `http://127.0.0.1:${BACKEND_PORT}`;

// ── Safety: prevent production connection ────────────────────────────────────

function assertSafeDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`[E2E SAFETY] Cannot parse DATABASE_URL: ${url}`);
  }

  const allowedHosts = ['127.0.0.1', 'localhost', '[::1]', 'postgres'];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `[E2E SAFETY] DATABASE_URL hostname "${parsed.hostname}" is NOT a local test host. ` +
      `Allowed: ${allowedHosts.join(', ')}. Aborting to prevent production writes.`
    );
  }

  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const testPatterns = ['test', 'e2e', '_test', '-test'];
  if (!testPatterns.some((p) => dbName.includes(p))) {
    throw new Error(
      `[E2E SAFETY] Database name "${dbName}" does not contain a test indicator. ` +
      `Expected one of: ${testPatterns.join(', ')}. Aborting.`
    );
  }

  // Block known cloud patterns
  const cloudPatterns = ['rds.amazonaws.com', 'aws', '.azure.', '.gcp.'];
  const fullUrl = url.toLowerCase();
  for (const pattern of cloudPatterns) {
    if (fullUrl.includes(pattern)) {
      throw new Error(`[E2E SAFETY] DATABASE_URL contains cloud pattern "${pattern}". Aborting.`);
    }
  }
}

// ── Seed test admins ─────────────────────────────────────────────────────────

async function seedTestAdmins(): Promise<void> {
  const backendDir = resolve(__dirname, '../../backend');
  execSync(
    `DATABASE_URL="${DATABASE_URL}" JWT_SECRET="${JWT_SECRET}" npx prisma db seed`,
    { cwd: backendDir, stdio: 'pipe', env: { ...process.env, DATABASE_URL, JWT_SECRET, NODE_ENV: 'test' } }
  );
}

// ── Login helper ─────────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BACKEND_BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} ${body}`);
  }
  const json = await res.json();
  return json.data?.token || json.token;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export interface E2EAuthState {
  superAdminToken: string;
  superAdminEmail: string;
}

export default async function globalSetup(): Promise<void> {
  console.log('[E2E Setup] Validating database safety...');
  assertSafeDatabase(DATABASE_URL);

  console.log('[E2E Setup] Running prisma migrate deploy...');
  const backendDir = resolve(__dirname, '../../backend');
  try {
    execSync(`DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy`, {
      cwd: backendDir,
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL, NODE_ENV: 'test' },
    });
  } catch (e: any) {
    console.warn('[E2E Setup] prisma migrate deploy warning:', e.stderr?.toString()?.slice(0, 200));
  }

  console.log('[E2E Setup] Seeding test admins...');
  try {
    await seedTestAdmins();
  } catch (e: any) {
    console.warn('[E2E Setup] Seed warning:', e.message?.slice(0, 200));
  }

  console.log('[E2E Setup] Obtaining auth tokens...');
  // Wait for backend to be ready
  let token = '';
  for (let i = 0; i < 10; i++) {
    try {
      token = await login('admin@kaviar.com', 'admin123');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!token) {
    throw new Error('[E2E Setup] Could not obtain admin token. Is the backend running?');
  }

  // Write auth state for tests
  const authDir = resolve(__dirname, '.auth');
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, 'state.json'),
    JSON.stringify({ superAdminToken: token, superAdminEmail: 'admin@kaviar.com' }),
    'utf-8'
  );

  console.log('[E2E Setup] ✅ Ready. Token obtained for admin@kaviar.com (SUPER_ADMIN).');
}
