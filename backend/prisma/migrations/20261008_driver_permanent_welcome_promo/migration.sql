-- KAVIAR: saldo promocional permanente de boas-vindas.
-- Não representa dinheiro recebido, saldo sacável ou recarga SumUp.
-- Migração preparada localmente; execução depende de autorização.

-- Subsídio promocional separado da arrecadação financeira.
ALTER TABLE ride_fee_splits
  ADD COLUMN fee_subsidized_cents BIGINT NOT NULL DEFAULT 0
  CHECK (fee_subsidized_cents >= 0);

CREATE TABLE driver_promo_wallets (
  driver_id TEXT PRIMARY KEY REFERENCES drivers(id),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  reserved_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT driver_promo_balance_nonnegative
    CHECK (balance_cents >= 0),

  CONSTRAINT driver_promo_reserved_valid
    CHECK (
      reserved_cents >= 0
      AND reserved_cents <= balance_cents
    )
);

CREATE TABLE driver_promo_ledger (
  id BIGSERIAL PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  entry_type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  reserved_delta_cents BIGINT NOT NULL DEFAULT 0,
  reserved_after_cents BIGINT NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT driver_promo_ledger_balance_nonnegative
    CHECK (balance_after_cents >= 0)
);

CREATE INDEX driver_promo_ledger_driver_created_idx
  ON driver_promo_ledger(driver_id, created_at DESC);

CREATE INDEX driver_promo_ledger_reference_idx
  ON driver_promo_ledger(reference_type, reference_id);
