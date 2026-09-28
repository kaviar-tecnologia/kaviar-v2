import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, createMessage } = vi.hoisted(() => ({
  prismaMock: {
    crm_leads: { findFirst: vi.fn() },
    whatsapp_invite_logs: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  authState: { admin: { id: 'admin-1', name: 'Suporte Kaviar', email: 'suporte@kaviar.com.br', role: 'SUPER_ADMIN' } },
  createMessage: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = authState.admin; next(); },
  requireRole: (roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.admin.role) ? next() : res.status(403).json({ success: false }),
}));
vi.mock('../src/middlewares/territory-scope', () => ({
  applyTerritoryScope: (req: any, _res: any, next: any) => { req.territoryScope = null; next(); },
}));
vi.mock('../src/modules/whatsapp/whatsapp-client', () => ({
  getTwilioClient: () => ({ messages: { create: createMessage } }),
  getWhatsAppFrom: () => 'whatsapp:+5521968648777',
  normalizeWhatsAppTo: (phone: string) => 'whatsapp:' + phone,
}));
vi.mock('../src/utils/audit', () => ({
  audit: vi.fn(),
  auditCtx: () => ({ adminId: 'admin-1', adminEmail: 'suporte@kaviar.com.br', ip: '127.0.0.1', ua: 'vitest' }),
}));

const { default: routes } = await import('../src/routes/admin-whatsapp-invites');
const app = express();
app.use(express.json());
app.use('/api/admin/whatsapp-invites', routes);

const candidate = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Candidata Exemplo',
  phone: '21999999999',
  territory_id: null,
  status: 'NEW',
};
const endpoint = '/api/admin/whatsapp-invites/send';
const payload = { type: 'manager_application', leadId: candidate.id, phone: '21999999999', targetName: 'Nome adulterado', force: false };

describe('WhatsApp manager application confirmation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    authState.admin.role = 'SUPER_ADMIN';
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test-token';
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+5521968648777';
    process.env.PUBLIC_API_BASE_URL = 'https://api.kaviar.com.br';
    delete process.env.TWILIO_WHATSAPP_TEMPLATE_MANAGER_APPLICATION_SID;
    prismaMock.crm_leads.findFirst.mockResolvedValue(candidate);
    prismaMock.whatsapp_invite_logs.findFirst.mockResolvedValue(null);
    prismaMock.whatsapp_invite_logs.count.mockResolvedValue(0);
    prismaMock.whatsapp_invite_logs.create.mockImplementation(async ({ data }: any) => ({ id: 'log-1', ...data }));
    prismaMock.whatsapp_invite_logs.update.mockImplementation(async ({ data }: any) => ({ id: 'log-1', ...data }));
    createMessage.mockResolvedValue({ sid: 'SMtest', status: 'queued' });
  });

  afterEach(() => { process.env = { ...originalEnv }; });

  it('uses the approved candidate template, registered CRM name, and official WhatsApp number', async () => {
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ twilioStatus: 'queued' });
    expect(prismaMock.crm_leads.findFirst).toHaveBeenCalledWith({
      where: { id: candidate.id, deleted_at: null, lead_type: 'TERRITORIAL_MANAGER', source: 'WEBSITE' },
      select: { id: true, name: true, phone: true, territory_id: true, status: true },
    });
    expect(prismaMock.whatsapp_invite_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invite_type: 'manager_application',
        source_screen: 'crm_manager_application',
        template_key: 'manager_application_confirmation',
        target_name: candidate.name,
        target_phone_normalized: '+5521999999999',
      }),
    });
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith({
      to: 'whatsapp:+5521999999999',
      from: 'whatsapp:+5521968648777',
      contentSid: 'HX93d53081930b106c8e5b266174c7611e',
      contentVariables: JSON.stringify({ '1': candidate.name }),
      statusCallback: 'https://api.kaviar.com.br/api/webhooks/twilio/whatsapp-status',
    });
  });

  it('allows rotation through the candidate template env without modifying generic manager invite', async () => {
    process.env.TWILIO_WHATSAPP_TEMPLATE_MANAGER_APPLICATION_SID = 'HXreplacement';
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ contentSid: 'HXreplacement' }));
  });

  it('allows only SUPER_ADMIN to send candidate confirmations', async () => {
    authState.admin.role = 'TERRITORIAL_MANAGER';
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(403);
    expect(prismaMock.crm_leads.findFirst).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('rejects a non-existent application and never sends a message', async () => {
    prismaMock.crm_leads.findFirst.mockResolvedValue(null);
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(404);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('requires leadId and ignores unverified recipients', async () => {
    const res = await request(app).post(endpoint).send({ type: 'manager_application', phone: payload.phone });
    expect(res.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('rejects phone mismatch with the selected CRM application', async () => {
    const res = await request(app).post(endpoint).send({ ...payload, phone: '21888888888' });
    expect(res.status).toBe(409);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'LOST', 'REJECTED'])('rejects application with status %s', async (status) => {
    prismaMock.crm_leads.findFirst.mockResolvedValue({ ...candidate, status });
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(409);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('blocks duplicates for seven days even if a super admin requests force', async () => {
    prismaMock.whatsapp_invite_logs.findFirst.mockResolvedValue({ id: 'previous', created_at: new Date() });
    const res = await request(app).post(endpoint).send({ ...payload, force: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_INVITE');
    expect(prismaMock.whatsapp_invite_logs.findFirst).toHaveBeenCalledWith({
      where: {
        target_phone_normalized: '+5521999999999',
        invite_type: 'manager_application',
        created_at: { gte: expect.any(Date) },
        duplicate_of_log_id: null,
      },
      orderBy: { created_at: 'desc' },
    });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('does not call Twilio when the daily limit has been reached', async () => {
    prismaMock.whatsapp_invite_logs.count.mockResolvedValue(200);
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(429);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('records failed Twilio sends instead of reporting success', async () => {
    createMessage.mockRejectedValue(new Error('Provider failure'));
    const res = await request(app).post(endpoint).send(payload);
    expect(res.status).toBe(502);
    expect(res.body.data.twilioStatus).toBe('failed');
    expect(prismaMock.whatsapp_invite_logs.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ twilio_status: 'failed', failed_at: expect.any(Date) }),
    }));
  });
});
