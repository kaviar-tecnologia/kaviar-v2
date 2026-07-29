import { Pool, PoolClient } from 'pg';

export interface MonthSummary {
  gross_cents: bigint;
  referral_costs_cents: bigint;
  family_return_costs_cents: bigint;
  adjustments_cents: bigint;
  net_cents: bigint;
}

export class TerritoryLedgerService {
  constructor(private pool: Pool) {}

  /**
   * Records platform_fee and fee_share atomically in caller's transaction.
   * Validates idempotency: same key with different data throws MISMATCH.
   *
   * For regions without manager: fee_share uses "Parcela territorial reservada".
   */
  async recordCollectedFeeInClient(
    client: PoolClient,
    territoryId: string,
    managerId: string | null,
    managerAssignmentId: string | null,
    platformFeeCents: bigint,
    managerShareCents: bigint,
    rideId: string,
    month: string,
    keySuffix?: string,
  ): Promise<{ platformEntryId: bigint; shareEntryId: bigint }> {
    const suffix = keySuffix ? `:${keySuffix}` : '';
    const platformKey = `territory_platform_fee:${rideId}${suffix}`;
    const managerKey = `territory_fee_share:${rideId}${suffix}`;

    const shareDescription = managerId
      ? 'Parcela contratual gestor'
      : 'Parcela territorial reservada';

    // Attempt INSERT with ON CONFLICT DO NOTHING
    const { rows: inserted } = await client.query(
      `INSERT INTO territory_ledger
        (territory_id, manager_id, manager_assignment_id, reference_month, entry_type,
         amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES
        ($1, $2, $3, $4, 'platform_fee', $5, 'Taxa plataforma arrecadada', 'ride', $7, $8),
        ($1, $2, $3, $4, 'fee_share', $6, $10, 'ride', $7, $9)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, idempotency_key, entry_type, amount_cents,
                 territory_id, manager_id, manager_assignment_id,
                 reference_month, reference_id`,
      [territoryId, managerId, managerAssignmentId, month,
       platformFeeCents.toString(), managerShareCents.toString(),
       rideId, platformKey, managerKey, shareDescription]
    );

    if (inserted.length === 2) {
      const pf = inserted.find(r => r.entry_type === 'platform_fee')!;
      const fs = inserted.find(r => r.entry_type === 'fee_share')!;
      return { platformEntryId: BigInt(pf.id), shareEntryId: BigInt(fs.id) };
    }

    // One or both conflicted — load and validate
    const { rows: existing } = await client.query(
      `SELECT id, idempotency_key, entry_type, amount_cents,
              territory_id, manager_id, manager_assignment_id,
              reference_month, reference_id
       FROM territory_ledger
       WHERE idempotency_key IN ($1, $2)`,
      [platformKey, managerKey]
    );

    for (const row of existing) {
      // Validate key matches correct entry_type
      if (row.idempotency_key === platformKey && row.entry_type !== 'platform_fee') {
        throw Object.assign(
          new Error(`Key ${platformKey} associated with '${row.entry_type}' instead of 'platform_fee'`),
          { code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' }
        );
      }
      if (row.idempotency_key === managerKey && row.entry_type !== 'fee_share') {
        throw Object.assign(
          new Error(`Key ${managerKey} associated with '${row.entry_type}' instead of 'fee_share'`),
          { code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' }
        );
      }

      // Validate economic consistency
      const isPlatform = row.idempotency_key === platformKey;
      const expectedAmount = isPlatform ? platformFeeCents : managerShareCents;

      const mismatch =
        row.territory_id !== territoryId ||
        (row.manager_id ?? null) !== (managerId ?? null) ||
        (row.manager_assignment_id ?? null) !== (managerAssignmentId ?? null) ||
        row.reference_month !== month ||
        row.reference_id !== rideId ||
        BigInt(row.amount_cents) !== expectedAmount;

      if (mismatch) {
        throw Object.assign(
          new Error(`Existing ledger entry ${row.idempotency_key} has divergent economic data`),
          { code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' }
        );
      }
    }

    // Combine inserted + existing to find both IDs
    const allEntries = [...inserted, ...existing];
    const pfEntry = allEntries.find(r =>
      r.idempotency_key === platformKey || r.entry_type === 'platform_fee'
    );
    const fsEntry = allEntries.find(r =>
      r.idempotency_key === managerKey || r.entry_type === 'fee_share'
    );

    if (!pfEntry || !fsEntry) {
      throw Object.assign(
        new Error('Expected two ledger entries (platform_fee + fee_share) but found incomplete pair'),
        { code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' }
      );
    }

    return { platformEntryId: BigInt(pfEntry.id), shareEntryId: BigInt(fsEntry.id) };
  }

  // ═══ Legacy methods (used by existing code, not yet refactored) ═══

  async recordFeeShare(territoryId: string, managerId: string | null, amountCents: bigint, rideId: string, month: string): Promise<void> {
    const key = `territory_fee_share:${rideId}`;
    await this.pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES ($1,$2,$3,'fee_share',$4,'Parcela gestor 40% da taxa','ride',$5,$6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [territoryId, managerId, month, amountCents.toString(), rideId, key]
    );
  }

  async recordReferralCost(territoryId: string, managerId: string | null, amountCents: bigint, rewardId: string, month: string): Promise<void> {
    const key = `territory_referral_cost:${rewardId}`;
    await this.pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES ($1,$2,$3,'referral_cost',$4,'Custo indicacao gestor R$10','reward',$5,$6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [territoryId, managerId, month, (-amountCents).toString(), rewardId, key]
    );
  }

  async recordFamilyReturnCost(territoryId: string, managerId: string | null, amountCents: bigint, requestId: string, month: string): Promise<void> {
    const key = `territory_family_return_cost:${requestId}`;
    await this.pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES ($1,$2,$3,'family_return_cost',$4,'Custo retorno familiar 50% gestor','family_return',$5,$6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [territoryId, managerId, month, (-amountCents).toString(), requestId, key]
    );
  }

  async getMonthSummary(territoryId: string, month: string): Promise<MonthSummary> {
    const r = await this.pool.query(
      `SELECT entry_type, COALESCE(SUM(amount_cents),0) as total FROM territory_ledger WHERE territory_id=$1 AND reference_month=$2 GROUP BY entry_type`,
      [territoryId, month]
    );
    let gross = BigInt(0), referral = BigInt(0), family = BigInt(0), adj = BigInt(0);
    for (const row of r.rows) {
      const v = BigInt(row.total);
      if (row.entry_type === 'fee_share') gross = v;
      else if (row.entry_type === 'referral_cost') referral = v;
      else if (row.entry_type === 'family_return_cost') family = v;
      else if (row.entry_type === 'adjustment') adj = v;
    }
    return { gross_cents: gross, referral_costs_cents: referral, family_return_costs_cents: family, adjustments_cents: adj, net_cents: gross + referral + family + adj };
  }
}
