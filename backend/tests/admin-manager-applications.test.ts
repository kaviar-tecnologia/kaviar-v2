import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    crm_leads: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    crm_interactions: { findMany: vi.fn(), create: vi.fn() },
    wa_conversations: { findMany: vi.fn() },
    whatsapp_invite_logs: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  authState: { admin: { id: 'admin-1', name: 'Suporte KAVIAR', role: 'SUPER_ADMIN', email: 'suporte@kaviar.com.br' } },
  auditMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = authState.admin; next(); },
  requireRole: (roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.admin.role) ? next() : res.status(403).json({ success: false, error: 'Forbidden' }),
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: () => ({ adminId: 'admin-1', adminEmail: 'suporte@kaviar.com.br', ip: '127.0.0.1', ua: 'test' }),
}));
const { default: routes } = await import('../src/routes/admin-manager-applications');
const app = express();
app.use(express.json());
app.use('/api/admin/crm/manager-applications', routes);

const lead = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Candidata Exemplo',
  phone: '21994542978',
  status: 'NEW',
  priority: 'HIGH',
  source: 'WEBSITE',
  updated_at: new Date('2026-09-28T11:35:00.000Z'),
  created_at: new Date('2026-09-27T12:00:00.000Z'),
};
const base = '/api/admin/crm/manager-applications';
const input = { outcome: 'ADVANCE', justification: 'Perfil apto para entrevista inicial.', expectedUpdatedAt: lead.updated_at.toISOString(), communicationRequested: true };

describe('manager applications triage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.admin.role = 'SUPER_ADMIN';
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.crm_leads.findMany.mockResolvedValue([lead]);
    prismaMock.crm_leads.count.mockResolvedValue(1);
    prismaMock.crm_leads.findFirst.mockResolvedValue(lead);
    prismaMock.crm_leads.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.crm_leads.findUnique.mockResolvedValue({ id: lead.id, status: 'INTERESTED', updated_at: new Date() });
    prismaMock.crm_interactions.findMany.mockResolvedValue([]);
    prismaMock.crm_interactions.create.mockImplementation(async ({ data }: any) => ({
      id: 'decision-1', ...data, created_at: new Date('2026-09-28T12:00:00Z'),
    }));
    prismaMock.wa_conversations.findMany.mockResolvedValue([]);
    prismaMock.whatsapp_invite_logs.findMany.mockResolvedValue([]);
  });

  it('requires SUPER_ADMIN for all candidate and decision views', async () => {
    authState.admin.role = 'TERRITORIAL_MANAGER';
    expect((await request(app).get(base)).status).toBe(403);
    expect((await request(app).post(base + '/' + lead.id + '/decisions').send(input)).status).toBe(403);
    expect(prismaMock.crm_leads.findMany).not.toHaveBeenCalled();
  });

  it('shows Gestor prospects without confusing them with manual support-point leads', async () => {
    const result = await request(app).get(base);
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].lead.name).toBe(lead.name);
    expect(result.body.data[0].conversation).toBeNull();
    expect(prismaMock.crm_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { lead_type: 'TERRITORIAL_MANAGER', deleted_at: null },
    }));
  });

  it('joins unread replies by exact full phone only after official application template', async () => {
    prismaMock.wa_conversations.findMany.mockResolvedValue([{
      id: 'conversation-1', phone: '+5521994542978',
      linked_entity_type: null, linked_entity_id: null,
      unread_count: 2, last_message_preview: 'Respondi suas perguntas',
      last_inbound_at: new Date('2026-09-28T12:00:00Z'),
    }]);
    prismaMock.whatsapp_invite_logs.findMany.mockResolvedValue([{ target_phone_normalized: '+5521994542978' }]);
    const result = await request(app).get(base);
    expect(result.status).toBe(200);
    expect(result.body.data[0].conversation).toMatchObject({ id: 'conversation-1', unreadCount: 2 });
    expect(result.body.data[0].linkStatus).toBe('linked');
  });

  it('never falls back by phone without verified candidate invitation', async () => {
    prismaMock.wa_conversations.findMany.mockResolvedValue([{
      id: 'unrelated', phone: '+5521994542978', linked_entity_type: 'driver', linked_entity_id: 'driver-1',
    }]);
    const result = await request(app).get(base);
    expect(result.status).toBe(200);
    expect(result.body.data[0].conversation).toBeNull();
  });

  it('requires a justification and a valid decision, without changing the CRM', async () => {
    expect((await request(app).post(base + '/' + lead.id + '/decisions').send({ ...input, justification: 'x' })).status).toBe(400);
    expect((await request(app).post(base + '/' + lead.id + '/decisions').send({ ...input, outcome: 'ACTIVATE' })).status).toBe(400);
    expect(prismaMock.crm_leads.updateMany).not.toHaveBeenCalled();
  });

  it('atomically logs the decision and advances only to INTERESTED, never activates Gestor or sends WhatsApp', async () => {
    const response = await request(app).post(base + '/' + lead.id + '/decisions').send(input);
    expect(response.status).toBe(201);
    expect(prismaMock.crm_leads.updateMany).toHaveBeenCalledWith({
      where: { id: lead.id, updated_at: lead.updated_at, status: lead.status },
      data: { status: 'INTERESTED' },
    });
    expect(prismaMock.crm_interactions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lead_id: lead.id, event_type: 'DECISION',
        old_status: 'NEW', new_status: 'INTERESTED',
        created_by_admin_id: 'admin-1',
      }),
    });
    const description = JSON.parse(prismaMock.crm_interactions.create.mock.calls[0][0].data.description);
    expect(description).toMatchObject({
      schema: 'manager_application_decision_v1',
      outcome: 'ADVANCE',
      justification: input.justification,
      communicationRequested: true,
    });
    expect(response.body.communication).toContain('nenhuma mensagem foi enviada');
    expect(response.body.data.decision.communicationStatus).toBe('pending_manual');
    expect(auditMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['REQUEST_INFO', 'CONTACTED'],
    ['KEEP_REVIEW', 'NEW'],
    ['DO_NOT_PROCEED', 'REJECTED'],
  ])('records %s without automatic business activation', async (outcome, status) => {
    const response = await request(app).post(base + '/' + lead.id + '/decisions').send({ ...input, outcome, communicationRequested: false });
    expect(response.status).toBe(201);
    expect(prismaMock.crm_leads.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status } }));
  });

  it('rejects stale state so a decision cannot overwrite concurrent CRM updates', async () => {
    const response = await request(app).post(base + '/' + lead.id + '/decisions').send({
      ...input, expectedUpdatedAt: '2026-09-20T00:00:00Z',
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('STALE_CANDIDATE');
    expect(prismaMock.crm_interactions.create).not.toHaveBeenCalled();
  });

  it('refuses to change an active manager', async () => {
    prismaMock.crm_leads.findFirst.mockResolvedValue({ ...lead, status: 'ACTIVE' });
    const response = await request(app).post(base + '/' + lead.id + '/decisions').send(input);
    expect(response.status).toBe(409);
    expect(prismaMock.crm_leads.updateMany).not.toHaveBeenCalled();
  });

  it('keeps historical decisions read-only and in descending order', async () => {
    prismaMock.crm_interactions.findMany.mockResolvedValue([{
      id: 'decision-1', lead_id: lead.id, event_type: 'DECISION',
      description: JSON.stringify({ schema: 'manager_application_decision_v1', outcome: 'KEEP_REVIEW', justification: 'Aguardando retorno', actorName: 'Suporte KAVIAR', communicationRequested: false }),
      old_status: 'NEW', new_status: 'NEW', created_by_admin_id: 'admin-1',
      created_at: new Date('2026-09-28T12:00:00Z'),
    }]);
    const result = await request(app).get(base + '/' + lead.id + '/decisions');
    expect(result.status).toBe(200);
    expect(result.body.data[0]).toMatchObject({ outcome: 'KEEP_REVIEW', actorName: 'Suporte KAVIAR' });
    expect(prismaMock.crm_interactions.findMany).toHaveBeenCalledWith({
      where: { lead_id: lead.id, event_type: 'DECISION' },
      orderBy: { created_at: 'desc' },
    });
  });
});
