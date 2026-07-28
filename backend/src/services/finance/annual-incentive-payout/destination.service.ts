/**
 * Payout Destination Service.
 *
 * Manages encrypted Pix CPF destinations for drivers.
 * Only CPF keys matching the driver's verified CPF are allowed.
 */

import { Pool, PoolClient } from 'pg';
import {
  PayoutDestination,
  AllowedPixKeyType,
  PAYOUT_ERRORS,
} from './types';
import {
  encryptPayoutSecret,
  decryptPayoutSecret,
  hmacPayoutValue,
  maskCpf,
  normalizeCpf,
  isValidCpf,
} from './crypto';

type Queryable = Pick<Pool | PoolClient, 'query'>;

export interface SetDestinationInput {
  driverId: string;
  pixKeyType: AllowedPixKeyType;
  pixKeyCpf: string; // raw CPF input
}

export interface DestinationPublic {
  id: string;
  provider: string;
  method: string;
  pixKeyType: string;
  pixKeyMasked: string;
  status: string;
  verifiedAt: Date | null;
  createdAt: Date;
}

function mapRow(row: any): PayoutDestination {
  return {
    id: row.id,
    driverId: row.driver_id,
    provider: row.provider,
    method: row.method,
    pixKeyType: row.pix_key_type as AllowedPixKeyType,
    pixKeyEncrypted: row.pix_key_encrypted,
    pixKeyHash: row.pix_key_hash,
    pixKeyMasked: row.pix_key_masked,
    ownerDocumentHash: row.owner_document_hash,
    status: row.status,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supersededAt: row.superseded_at,
  };
}

/**
 * Gets the active payout destination for a driver.
 */
export async function getActiveDestination(
  db: Queryable,
  driverId: string,
): Promise<PayoutDestination | null> {
  const { rows } = await db.query(
    `SELECT * FROM driver_payout_destinations
     WHERE driver_id = $1 AND status = 'active' AND superseded_at IS NULL
     LIMIT 1`,
    [driverId]
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/**
 * Gets the driver's CPF from the drivers table.
 */
export async function getDriverCpf(
  db: Queryable,
  driverId: string,
): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT document_cpf FROM drivers WHERE id = $1`,
    [driverId]
  );
  return rows[0]?.document_cpf ?? null;
}

/**
 * Sets or replaces the driver's payout destination.
 * Validates that the CPF matches the driver's registered CPF.
 */
export async function setDestination(
  pool: Pool,
  input: SetDestinationInput,
): Promise<PayoutDestination> {
  const { driverId, pixKeyType, pixKeyCpf } = input;

  // Normalize and validate CPF
  const normalized = normalizeCpf(pixKeyCpf);
  if (!isValidCpf(normalized)) {
    throw Object.assign(
      new Error('Invalid CPF format'),
      { code: PAYOUT_ERRORS.DESTINATION_INVALID }
    );
  }

  // Verify CPF matches driver's registered document
  const driverCpf = await getDriverCpf(pool, driverId);
  if (!driverCpf) {
    throw Object.assign(
      new Error('Driver CPF not registered'),
      { code: PAYOUT_ERRORS.CPF_NOT_VERIFIED }
    );
  }

  const driverCpfNorm = normalizeCpf(driverCpf);
  if (normalized !== driverCpfNorm) {
    throw Object.assign(
      new Error('PIX key CPF does not match driver document'),
      { code: PAYOUT_ERRORS.CPF_MISMATCH }
    );
  }

  // Encrypt and hash
  const encrypted = encryptPayoutSecret(normalized);
  const hash = hmacPayoutValue(normalized);
  const masked = maskCpf(normalized);
  const ownerDocHash = hmacPayoutValue(driverCpfNorm);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Supersede existing active destination
    await client.query(
      `UPDATE driver_payout_destinations
       SET status = 'superseded', superseded_at = NOW(), updated_at = NOW()
       WHERE driver_id = $1 AND status = 'active' AND superseded_at IS NULL`,
      [driverId]
    );

    // Insert new active destination
    const keyVersion = process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION ?? '1';
    const { rows } = await client.query(
      `INSERT INTO driver_payout_destinations
       (driver_id, provider, method, pix_key_type, pix_key_encrypted, pix_key_hash,
        pix_key_masked, owner_document_hash, encryption_key_version, status, verified_at)
       VALUES ($1, 'pix', 'CPF', $2, $3, $4, $5, $6, $7, 'active', NOW())
       RETURNING *`,
      [driverId, pixKeyType, encrypted, hash, masked, ownerDocHash, keyVersion]
    );

    await client.query('COMMIT');
    return mapRow(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns a safe public representation of the destination.
 */
export function toPublicDestination(dest: PayoutDestination): DestinationPublic {
  return {
    id: dest.id,
    provider: dest.provider,
    method: dest.method,
    pixKeyType: dest.pixKeyType,
    pixKeyMasked: dest.pixKeyMasked,
    status: dest.status,
    verifiedAt: dest.verifiedAt,
    createdAt: dest.createdAt,
  };
}
