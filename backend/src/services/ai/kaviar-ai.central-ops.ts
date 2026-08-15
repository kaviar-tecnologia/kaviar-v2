/**
 * Chat KAVIAR — Central Operacional v1
 * Tools: operations_overview, person_lookup, driver_detail, seal_history
 */
import { pool } from '../../db';

// ══════════════════════════════════════════════════════════════════════════════
// 1. OPERATIONS_OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════

export type OperationsOverviewData = {
  available: boolean;
  drivers: { total: number; active: number; pending: number; suspended: number; sealActive: number; sealSuspended: number; petApproved: number };
  admins: { total: number; byRole: Record<string, number> };
  territories: { total: number; active: number; preparation: number; blocked: number };
  referenceTime: string;
};

export async function getOperationsOverview(): Promise<{ tool: 'operations_overview'; data: OperationsOverviewData }> {
  try {
    const dResult = await pool.query<{ total: number; active: number; pending: number; suspended: number }>(`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active,
             COUNT(*) FILTER (WHERE status='pending')::int AS pending, COUNT(*) FILTER (WHERE status='suspended')::int AS suspended
      FROM drivers`);
    const sealResult = await pool.query<{ seal_active: number; seal_suspended: number }>(`
      SELECT COUNT(*) FILTER (WHERE progress=100)::int AS seal_active, COUNT(*) FILTER (WHERE progress=0)::int AS seal_suspended
      FROM driver_badges WHERE badge_type='EXCELLENCE_SEAL'`);
    const petResult = await pool.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM pet_homologations WHERE quiz_passed=true`);
    const adminResult = await pool.query<{ role: string; cnt: number }>(`SELECT role, COUNT(*)::int AS cnt FROM admins WHERE is_active=true GROUP BY role`);
    const terResult = await pool.query<{ total: number; active: number; preparation: number; blocked: number }>(`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active,
             COUNT(*) FILTER (WHERE status='preparation')::int AS preparation,
             COUNT(*) FILTER (WHERE regulatory_status='blocked')::int AS blocked
      FROM operational_territories WHERE level='city' AND is_active=true`);
    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);

    const d = dResult.rows[0]!; const s = sealResult.rows[0]!; const t = terResult.rows[0]!;
    const byRole: Record<string, number> = {}; for (const r of adminResult.rows) byRole[r.role] = r.cnt;

    return { tool: 'operations_overview', data: {
      available: true,
      drivers: { total: d.total, active: d.active, pending: d.pending, suspended: d.suspended, sealActive: s.seal_active, sealSuspended: s.seal_suspended, petApproved: petResult.rows[0]?.cnt ?? 0 },
      admins: { total: Object.values(byRole).reduce((a, b) => a + b, 0), byRole },
      territories: { total: t.total, active: t.active, preparation: t.preparation, blocked: t.blocked },
      referenceTime: refResult.rows[0]?.ref ?? '',
    }};
  } catch (err: any) {
    console.error(`[OPERATIONS_OVERVIEW_ERROR] ${err?.message?.slice(0, 100)}`);
    return { tool: 'operations_overview', data: { available: false, drivers: { total: 0, active: 0, pending: 0, suspended: 0, sealActive: 0, sealSuspended: 0, petApproved: 0 }, admins: { total: 0, byRole: {} }, territories: { total: 0, active: 0, preparation: 0, blocked: 0 }, referenceTime: '' } };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PERSON_LOOKUP
// ══════════════════════════════════════════════════════════════════════════════

export type PersonLookupResult = {
  type: 'driver' | 'admin' | 'passenger';
  id: string;
  name: string;
  status: string;
  role?: string;
  adminLink: string;
};

export type PersonLookupData = {
  available: boolean;
  query: string;
  results: PersonLookupResult[];
  ambiguous: boolean;
  message: string;
};

export async function getPersonLookup(args?: Record<string, string>): Promise<{ tool: 'person_lookup'; data: PersonLookupData }> {
  const query = (args?.name ?? '').trim().slice(0, 100);
  if (!query || query.length < 2) {
    return { tool: 'person_lookup', data: { available: true, query, results: [], ambiguous: false, message: 'Informe o nome da pessoa para buscar.' } };
  }

  try {
    const results: PersonLookupResult[] = [];
    const pattern = `%${query}%`;

    // Search drivers (by name only, never by CPF/phone/email)
    const drivers = await pool.query<{ id: string; name: string; status: string }>(`
      SELECT id, name, status FROM drivers WHERE LOWER(name) LIKE LOWER($1) LIMIT 5`, [pattern]);
    for (const d of drivers.rows) results.push({ type: 'driver', id: d.id, name: d.name, status: d.status, adminLink: `/admin/drivers` });

    // Search admins
    const admins = await pool.query<{ id: string; name: string; role: string }>(`
      SELECT id, name, role FROM admins WHERE is_active=true AND LOWER(name) LIKE LOWER($1) LIMIT 5`, [pattern]);
    for (const a of admins.rows) results.push({ type: 'admin', id: a.id, name: a.name, status: 'active', role: a.role, adminLink: `/admin/staff` });

    // Search passengers (only name and status)
    const passengers = await pool.query<{ id: string; name: string }>(`
      SELECT id, name FROM passengers WHERE LOWER(name) LIKE LOWER($1) LIMIT 5`, [pattern]);
    for (const p of passengers.rows) results.push({ type: 'passenger', id: p.id, name: p.name, status: 'registered', adminLink: null as any });

    const ambiguous = results.length > 1;
    let message = '';
    if (results.length === 0) message = `Nenhuma pessoa encontrada com "${query}".`;
    else if (results.length === 1) message = `Encontrado: ${results[0].name} (${results[0].type}).`;
    else message = `${results.length} resultados para "${query}". Qual deles?`;

    // Audit: log invocation without PII (no name searched, only count)
    console.log(`[PERSON_LOOKUP_AUDIT] results=${results.length} ambiguous=${ambiguous}`);

    return { tool: 'person_lookup', data: { available: true, query, results, ambiguous, message } };
  } catch (err: any) {
    console.error(`[PERSON_LOOKUP_ERROR] ${err?.message?.slice(0, 100)}`);
    return { tool: 'person_lookup', data: { available: false, query, results: [], ambiguous: false, message: 'Não foi possível realizar a busca.' } };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. DRIVER_DETAIL
// ══════════════════════════════════════════════════════════════════════════════

export type DriverDetailData = {
  available: boolean;
  found: boolean;
  name: string | null;
  status: string | null;
  vehicleType: string | null;
  rating: { average: string | null; total: number; lowLast30d: number; needsAttention: boolean } | null;
  compliance: { currentStatus: string | null; validUntil: string | null; emissionDate: string | null } | null;
  seal: { active: boolean; suspended: boolean; grantedAt: string | null } | null;
  modalities: { modality: string; status: string }[];
  adminLink: string;
};

export async function getDriverDetail(args?: Record<string, string>): Promise<{ tool: 'driver_detail'; data: DriverDetailData }> {
  const driverId = args?.driverId?.trim();
  if (!driverId) return { tool: 'driver_detail', data: { available: true, found: false, name: null, status: null, vehicleType: null, rating: null, compliance: null, seal: null, modalities: [], adminLink: '' } };

  try {
    const driverResult = await pool.query<{ name: string; status: string; vehicle_type: string }>(`SELECT name, status, vehicle_type FROM drivers WHERE id=$1`, [driverId]);
    if (driverResult.rows.length === 0) return { tool: 'driver_detail', data: { available: true, found: false, name: null, status: null, vehicleType: null, rating: null, compliance: null, seal: null, modalities: [], adminLink: '' } };
    const d = driverResult.rows[0]!;

    // Ratings
    const ratingResult = await pool.query<{ avg: string | null; total: number }>(`SELECT average_rating::text AS avg, total_ratings::int AS total FROM rating_stats WHERE entity_type='DRIVER' AND entity_id=$1`, [driverId]);
    const lowResult = await pool.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM ratings WHERE entity_type='DRIVER' AND rater_type='PASSENGER' AND entity_id=$1 AND rating<=2 AND created_at>=(NOW()-INTERVAL '30 days')`, [driverId]);
    const rating = { average: ratingResult.rows[0]?.avg ?? null, total: ratingResult.rows[0]?.total ?? 0, lowLast30d: lowResult.rows[0]?.cnt ?? 0, needsAttention: (lowResult.rows[0]?.cnt ?? 0) >= 3 };

    // Compliance
    const compResult = await pool.query<{ status: string; valid_until: string | null; emission_date: string | null }>(`SELECT status, valid_until::text, emission_date::text FROM driver_compliance_documents WHERE driver_id=$1 AND is_current=true LIMIT 1`, [driverId]);
    const compliance = compResult.rows[0] ? { currentStatus: compResult.rows[0].status, validUntil: compResult.rows[0].valid_until, emissionDate: compResult.rows[0].emission_date } : null;

    // Seal
    const sealResult = await pool.query<{ progress: number; unlocked_at: string }>(`SELECT progress::int, unlocked_at::text FROM driver_badges WHERE driver_id=$1 AND badge_type='EXCELLENCE_SEAL'`, [driverId]);
    const seal = sealResult.rows[0] ? { active: sealResult.rows[0].progress === 100, suspended: sealResult.rows[0].progress === 0, grantedAt: sealResult.rows[0].unlocked_at } : null;

    // Modalities
    const modResult = await pool.query<{ modality: string; status: string }>(`SELECT modality, status FROM driver_modalities WHERE driver_id=$1`, [driverId]);

    return { tool: 'driver_detail', data: { available: true, found: true, name: d.name, status: d.status, vehicleType: d.vehicle_type, rating, compliance, seal, modalities: modResult.rows, adminLink: `/admin/drivers` } };
  } catch (err: any) {
    console.error(`[DRIVER_DETAIL_ERROR] ${err?.message?.slice(0, 100)}`);
    return { tool: 'driver_detail', data: { available: false, found: false, name: null, status: null, vehicleType: null, rating: null, compliance: null, seal: null, modalities: [], adminLink: '' } };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. SEAL_HISTORY
// ══════════════════════════════════════════════════════════════════════════════

export type SealHistoryData = {
  available: boolean;
  totalActive: number;
  totalSuspended: number;
  recentEvents: { driverName: string; eventType: string; reason: string | null; createdAt: string }[];
  referenceTime: string;
};

export async function getSealHistory(): Promise<{ tool: 'seal_history'; data: SealHistoryData }> {
  try {
    const countResult = await pool.query<{ active: number; suspended: number }>(`
      SELECT COUNT(*) FILTER (WHERE progress=100)::int AS active, COUNT(*) FILTER (WHERE progress=0)::int AS suspended
      FROM driver_badges WHERE badge_type='EXCELLENCE_SEAL'`);
    const eventsResult = await pool.query<{ driver_name: string; event_type: string; reason: string | null; created_at: string }>(`
      SELECT d.name AS driver_name, e.event_type, e.reason, e.created_at::text
      FROM driver_badge_events e INNER JOIN drivers d ON d.id=e.driver_id
      WHERE e.badge_code='EXCELLENCE_SEAL'
      ORDER BY e.created_at DESC LIMIT 10`);
    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);
    const c = countResult.rows[0]!;
    return { tool: 'seal_history', data: { available: true, totalActive: c.active, totalSuspended: c.suspended, recentEvents: eventsResult.rows.map(e => ({ driverName: e.driver_name, eventType: e.event_type, reason: e.reason, createdAt: e.created_at })), referenceTime: refResult.rows[0]?.ref ?? '' } };
  } catch (err: any) {
    console.error(`[SEAL_HISTORY_ERROR] ${err?.message?.slice(0, 100)}`);
    return { tool: 'seal_history', data: { available: false, totalActive: 0, totalSuspended: 0, recentEvents: [], referenceTime: '' } };
  }
}
