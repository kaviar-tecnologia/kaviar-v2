import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import twilio from 'twilio';

const { prismaMock, resolveApplicant, alertMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    wa_messages: { findFirst: vi.fn(), create: vi.fn() },
    wa_conversations: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    drivers: { findFirst: vi.fn() },
    passengers: { findFirst: vi.fn() },
    tourist_guides: { findFirst: vi.fn() },
    consultant_leads: { findFirst: vi.fn() },
    pet_homologations: { findMany: vi.fn() },
  },
  resolveApplicant: vi.fn(),
  alertMock: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/whatsapp/manager-applicant-link', () => ({ resolveInvitedManagerApplicant: resolveApplicant }));
vi.mock('../src/services/admin-alert.service', () => ({ notifyAdminNewContact: alertMock }));
const { integrationsRoutes } = await import('../src/routes/integrations');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/webhooks', integrationsRoutes);
const endpoint = '/webhooks/twilio/whatsapp';
const body = { From: 'whatsapp:+5521994542978', Body: 'Olá, seguem minhas respostas', MessageSid: 'SM-real-unique-id', ProfileName: 'Ana' };

describe('official WhatsApp inbound manager association', () => {
  const savedEnv = { ...process.env };
  afterEach(() => { process.env = { ...savedEnv }; });
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.wa_messages.findFirst.mockResolvedValue(null);
    prismaMock.wa_conversations.findUnique.mockResolvedValue(null);
    prismaMock.wa_conversations.create.mockImplementation(async ({ data }: any) => ({ id: 'conversation-1', ...data }));
    prismaMock.wa_conversations.update.mockImplementation(async ({ data }: any) => ({ id: 'conversation-1', ...data }));
    prismaMock.wa_messages.create.mockResolvedValue({ id: 'message-1' });
    resolveApplicant.mockResolvedValue({ id: 'original-website-application', name: 'Ana Julia' });
    alertMock.mockResolvedValue(undefined);
  });

  it('rejects missing or invalid signature in production before writing anything', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_AUTH_TOKEN = 'test-secret';
    process.env.PUBLIC_API_BASE_URL = 'https://api.kaviar.com.br';
    const unsigned = await request(app).post(endpoint).type('form').send(body);
    const bad = await request(app).post(endpoint).type('form').set('X-Twilio-Signature', 'bad').send(body);
    expect(unsigned.status).toBe(403);
    expect(bad.status).toBe(403);
    expect(prismaMock.wa_messages.create).not.toHaveBeenCalled();
  });

  it('accepts a correct Twilio signature for the configured exact public URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_AUTH_TOKEN = 'test-secret';
    process.env.PUBLIC_API_BASE_URL = 'https://api.kaviar.com.br';
    const sig = twilio.getExpectedTwilioSignature('test-secret', 'https://api.kaviar.com.br' + endpoint, body);
    const result = await request(app).post(endpoint).type('form').set('X-Twilio-Signature', sig).send(body);
    expect(result.status).toBe(200);
    expect(prismaMock.wa_messages.create).toHaveBeenCalledOnce();
  });

  it('links inbound reply to original website Gestor application and stores exactly one message', async () => {
    const result = await request(app).post(endpoint).type('form').send(body);
    expect(result.status).toBe(200);
    expect(prismaMock.wa_conversations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: '+5521994542978',
        contact_type: 'manager',
        linked_entity_type: 'crm_lead',
        linked_entity_id: 'original-website-application',
        unread_count: 1,
        last_message_preview: body.Body,
      }),
    });
    expect(prismaMock.wa_messages.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.wa_messages.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ direction: 'inbound', body: body.Body, twilio_sid: body.MessageSid }),
    });
  });

  it('reclassifies an unknown existing conversation but never overwrites a linked driver', async () => {
    prismaMock.wa_conversations.findUnique.mockResolvedValueOnce({ id: 'existing', phone: '+5521994542978', contact_type: 'unknown', linked_entity_id: null, unread_count: 0 });
    let result = await request(app).post(endpoint).type('form').send(body);
    expect(result.status).toBe(200);
    expect(prismaMock.wa_conversations.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contact_type: 'manager', linked_entity_type: 'crm_lead', linked_entity_id: 'original-website-application' }),
    }));

    prismaMock.wa_conversations.update.mockClear();
    prismaMock.wa_conversations.findUnique.mockResolvedValueOnce({ id: 'existing', phone: '+5521994542978', contact_type: 'driver', linked_entity_id: 'driver-1', unread_count: 0 });
    result = await request(app).post(endpoint).type('form').send({ ...body, MessageSid: 'SM-other' });
    expect(result.status).toBe(200);
    expect(prismaMock.wa_conversations.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ linked_entity_type: 'crm_lead' }),
    }));
  });

  it('acknowledges duplicate Twilio SID without double counting or saving again', async () => {
    prismaMock.wa_messages.findFirst.mockResolvedValue({ id: 'already-stored' });
    const result = await request(app).post(endpoint).type('form').send(body);
    expect(result.status).toBe(200);
    expect(prismaMock.wa_conversations.create).not.toHaveBeenCalled();
    expect(prismaMock.wa_messages.create).not.toHaveBeenCalled();
  });

  it('returns a retryable error when persistence fails instead of acknowledging and losing a reply', async () => {
    prismaMock.wa_messages.create.mockRejectedValue(new Error('Database unavailable'));
    const result = await request(app).post(endpoint).type('form').send(body);
    expect(result.status).toBe(503);
  });

  it('never fabricates a Gestor association if the official invitation or unique lead is missing', async () => {
    resolveApplicant.mockResolvedValue(null);
    prismaMock.drivers.findFirst.mockResolvedValue(null);
    prismaMock.passengers.findFirst.mockResolvedValue(null);
    prismaMock.tourist_guides.findFirst.mockResolvedValue(null);
    prismaMock.consultant_leads.findFirst.mockResolvedValue(null);
    prismaMock.pet_homologations.findMany.mockResolvedValue([]);
    const result = await request(app).post(endpoint).type('form').send(body);
    expect(result.status).toBe(200);
    expect(prismaMock.wa_conversations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contact_type: 'unknown', linked_entity_id: null }),
    });
  });
});
