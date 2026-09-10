-- Post-Prisma structural objects required for DR bootstrap parity.
-- This file contains only objects not reliably represented by Prisma datamodel baseline.
-- Source migrations are documented per object.

-- Source: backend/prisma/migrations/20260712230000_phase5e_municipal_renewal_cycles/migration.sql
-- Runtime rationale: enforce uniqueness when service_modality is NULL for protocol cycles.
CREATE UNIQUE INDEX IF NOT EXISTS municipal_regulatory_driver_protocols_case_driver_null_modality
ON public.municipal_regulatory_driver_protocols (case_id, driver_id, cycle_number)
WHERE driver_id IS NOT NULL
  AND service_modality IS NULL;

-- Source: backend/prisma/migrations/20260712230000_phase5e_municipal_renewal_cycles/migration.sql
-- Runtime rationale: enforce one open manual authorization draft per tuple.
CREATE UNIQUE INDEX IF NOT EXISTS municipal_authorizations_open_manual_draft_key
ON public.municipal_authorizations (driver_id, city, state, service_modality)
WHERE source_driver_protocol_id IS NULL
  AND status IN (
    'DOCUMENTS_PENDING',
    'IN_REVIEW_BY_KAVIAR',
    'READY_FOR_CITY_HALL'
  );

-- origin: backend/prisma/migrations/20260416_move_startup_ddl.sql
-- classification: AUDIT_REQUIRED
-- runtime consumers: backend/src/utils/audit.ts, backend/src/routes/admin-audit.ts, backend/src/routes/admin-operations.ts, backend/src/routes/admin-drivers.ts
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.admin_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.admin_audit_logs(entity_type, entity_id);

-- origin: backend/prisma/migrations/20260416_move_startup_ddl.sql
-- classification: AUDIT_REQUIRED
-- runtime consumers: backend/src/utils/audit.ts, backend/src/routes/admin-audit.ts
CREATE TABLE IF NOT EXISTS public.admin_login_history (
  id SERIAL PRIMARY KEY,
  admin_id TEXT,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  fail_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_email ON public.admin_login_history(email);
CREATE INDEX IF NOT EXISTS idx_login_created_at ON public.admin_login_history(created_at);

-- origin: backend/migrations/20260403_add_driver_referred_by.sql
-- classification: LEGACY_STILL_REFERENCED
-- runtime consumers: backend/src/routes/admin-driver-credits.ts
CREATE TABLE IF NOT EXISTS public.driver_referral_log (
  id SERIAL PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  referred_by TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'first_credit_purchase',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_log_driver ON public.driver_referral_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_referral_log_referred_by ON public.driver_referral_log(referred_by);

-- origin: backend/prisma/migrations/manual/007_territory_price_floors.sql + manual/009_territory_floors_governance.sql
-- classification: RUNTIME_REQUIRED
-- runtime consumers: backend/src/services/territory-floor.service.ts, backend/src/routes/admin-territory-floors.ts, backend/src/routes/admin-manager-territory-floors.ts
CREATE TABLE IF NOT EXISTS public.territory_price_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL,
  pricing_profile_id UUID REFERENCES public.pricing_profiles(id) ON DELETE SET NULL,
  origin_label TEXT NOT NULL,
  origin_neighborhood_id TEXT,
  dest_label TEXT NOT NULL,
  dest_neighborhood_id TEXT,
  floor_price DECIMAL(8,2) NOT NULL,
  surcharge DECIMAL(8,2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  submitted_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT chk_floor_price_positive CHECK (floor_price > 0),
  CONSTRAINT chk_surcharge_non_negative CHECK (surcharge >= 0),
  CONSTRAINT chk_tpf_status CHECK (status IN ('active', 'draft', 'pending_approval', 'rejected', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_tpf_territory_active
  ON public.territory_price_floors (territory_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tpf_origin_dest
  ON public.territory_price_floors (origin_neighborhood_id, dest_neighborhood_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tpf_origin_label
  ON public.territory_price_floors (territory_id, origin_label)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tpf_pending_approval
  ON public.territory_price_floors (status, territory_id)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_tpf_active_status
  ON public.territory_price_floors (origin_neighborhood_id, dest_neighborhood_id, status)
  WHERE is_active = true AND status = 'active';

-- origin: backend/prisma/migrations/manual/010_retorno_familiar_mvp.sql
-- classification: LEGACY_STILL_REFERENCED
-- runtime consumers: backend/src/routes/admin-retorno-familiar.ts, backend/src/routes/driver-retorno-familiar.ts
CREATE TABLE IF NOT EXISTS public.retorno_familiar_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL UNIQUE,
  percent_rate DECIMAL(5,2) NOT NULL,
  max_per_driver_cents INT,
  fund_budget_cents INT,
  request_start DATE NOT NULL,
  request_end DATE NOT NULL,
  payment_deadline DATE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.retorno_familiar_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id TEXT NOT NULL REFERENCES public.drivers(id),
  policy_id UUID NOT NULL REFERENCES public.retorno_familiar_policy(id),
  year INT NOT NULL,
  total_paid_cents INT NOT NULL,
  total_purchases INT NOT NULL,
  calculated_return_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','in_review','approved','rejected','paid','canceled')),
  approved_amount_cents INT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  paid_at TIMESTAMPTZ,
  paid_method TEXT,
  paid_reference TEXT,
  paid_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(driver_id, year)
);

CREATE INDEX IF NOT EXISTS idx_rfr_status ON public.retorno_familiar_requests(status);
CREATE INDEX IF NOT EXISTS idx_rfr_year ON public.retorno_familiar_requests(year);
CREATE INDEX IF NOT EXISTS idx_rfr_policy ON public.retorno_familiar_requests(policy_id);
CREATE INDEX IF NOT EXISTS idx_rfr_driver ON public.retorno_familiar_requests(driver_id);

-- origin: backend/prisma/migrations/20260218_ride_flow_v1/migration.sql
-- classification: DATA_INTEGRITY_REQUIRED
-- runtime consumers: backend/src/routes/rides-v2.ts, backend/src/routes/drivers-v2.ts
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_rides_v2_updated_at ON public.rides_v2;
CREATE TRIGGER update_rides_v2_updated_at
BEFORE UPDATE ON public.rides_v2
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ride_offers_updated_at ON public.ride_offers;
CREATE TRIGGER update_ride_offers_updated_at
BEFORE UPDATE ON public.ride_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_status_updated_at ON public.driver_status;
CREATE TRIGGER update_driver_status_updated_at
BEFORE UPDATE ON public.driver_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_locations_updated_at ON public.driver_locations;
CREATE TRIGGER update_driver_locations_updated_at
BEFORE UPDATE ON public.driver_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- origin: backend/prisma/migrations/20260702093000_add_regulatory_consultation_logs/migration.sql
-- classification: DATA_INTEGRITY_REQUIRED
-- runtime consumers: municipal consultation logging flows
CREATE OR REPLACE FUNCTION public.trg_set_updated_at_mrcl()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_mrcl ON public.municipal_regulatory_consultation_logs;
CREATE TRIGGER set_updated_at_mrcl
BEFORE UPDATE ON public.municipal_regulatory_consultation_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_updated_at_mrcl();

-- origin: backend/prisma/migrations/20260707190000_add_municipal_regularization/migration.sql
-- classification: DATA_INTEGRITY_REQUIRED
-- runtime consumers: municipal regularization update flows
CREATE OR REPLACE FUNCTION public.set_updated_at_municipal_regulations()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_municipal_regulations ON public.municipal_regulations;
CREATE TRIGGER trg_set_updated_at_municipal_regulations
BEFORE UPDATE ON public.municipal_regulations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_municipal_regulations();

CREATE OR REPLACE FUNCTION public.set_updated_at_municipal_regulation_requirements()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_municipal_regulation_requirements ON public.municipal_regulation_requirements;
CREATE TRIGGER trg_set_updated_at_municipal_regulation_requirements
BEFORE UPDATE ON public.municipal_regulation_requirements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_municipal_regulation_requirements();

CREATE OR REPLACE FUNCTION public.set_updated_at_municipal_authorizations()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_municipal_authorizations ON public.municipal_authorizations;
CREATE TRIGGER trg_set_updated_at_municipal_authorizations
BEFORE UPDATE ON public.municipal_authorizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_municipal_authorizations();

-- origin: backend/prisma/migrations/20260703170500_reconcile_operational_insurance_coverages_table/migration.sql
-- classification: DATA_INTEGRITY_REQUIRED
-- runtime consumers: operational insurance coverage admin flows
CREATE OR REPLACE FUNCTION public.trg_set_updated_at_operational_insurance_coverages()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_operational_insurance_coverages ON public.operational_insurance_coverages;
CREATE TRIGGER set_updated_at_operational_insurance_coverages
BEFORE UPDATE ON public.operational_insurance_coverages
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_updated_at_operational_insurance_coverages();
