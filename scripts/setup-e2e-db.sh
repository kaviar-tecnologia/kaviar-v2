#!/bin/bash
# Setup script for E2E integrated tests
# Creates DB schema, legacy tables, and seeds data for kaviar_test
#
# Usage: ./scripts/setup-e2e-db.sh
# Requires: PostgreSQL running on localhost:5432 with kaviar_test database

set -e

DB_URL="${E2E_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test}"
BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"

echo "🔒 Validating database URL safety..."
if echo "$DB_URL" | grep -qi "rds\|amazonaws\|azure\|gcp"; then
  echo "❌ ERROR: DATABASE_URL appears to be a cloud/production database. Aborting."
  exit 1
fi
if ! echo "$DB_URL" | grep -qi "test\|e2e"; then
  echo "❌ ERROR: Database name must contain 'test' or 'e2e'. Aborting."
  exit 1
fi

echo "📦 Pushing Prisma schema to test database..."
cd "$BACKEND_DIR"
DATABASE_URL="$DB_URL" npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || true

echo "🗃️  Creating legacy tables (admin_audit_logs, admin_login_history)..."
PGPASSWORD=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p') \
PGUSER=$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p') \
PGHOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p') \
PGPORT=$(echo "$DB_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p') \
PGDATABASE=$(echo "$DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p') \
psql -c "
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id TEXT NOT NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON admin_audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS admin_login_history (
  id SERIAL PRIMARY KEY,
  admin_id TEXT,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  fail_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
" 2>/dev/null

echo "🌱 Running seed..."
DATABASE_URL="$DB_URL" JWT_SECRET=e2e-test-secret npx prisma db seed 2>/dev/null || echo "⚠️  Seed had warnings (may be fine if data already exists)"

echo "✅ E2E database setup complete!"
echo ""
echo "To run integrated tests:"
echo "  1. Start backend: DATABASE_URL=\"$DB_URL\" JWT_SECRET=e2e-test-secret PORT=3003 NODE_ENV=test npx tsx src/server.ts"
echo "  2. Start frontend: cd ../frontend-app && npx vite --port 5174"
echo "  3. Run tests: cd ../frontend-app && TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts"
