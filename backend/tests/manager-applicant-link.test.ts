import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    crm_leads: { findMany: vi.fn() },
    whatsapp_invite_logs: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
const { normalizeManagerPhone, managerPhoneVariants, resolveInvitedManagerApplicant } =
  await import('../src/services/whatsapp/manager-applicant-link');

describe('safe Gestor applicant WhatsApp resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.crm_leads.findMany.mockResolvedValue([{
      id: 'original-candidate', name: 'Anna Julia Silva dos Santos', phone: '21994542978',
    }]);
    prismaMock.whatsapp_invite_logs.findFirst.mockResolvedValue({ id: 'official-send' });
  });

  it('normalizes full phone with or without +55 but never accepts suffix only', () => {
    expect(normalizeManagerPhone('21994542978')).toBe('+5521994542978');
    expect(normalizeManagerPhone('whatsapp:+55 (21) 99454-2978')).toBe('+5521994542978');
    expect(normalizeManagerPhone('994542978')).toBeNull();
    expect(managerPhoneVariants('21994542978')).toEqual(['+5521994542978', '5521994542978', '21994542978']);
  });

  it('links a unique original applicant after official candidature invitation', async () => {
    const match = await resolveInvitedManagerApplicant('whatsapp:+5521994542978');
    expect(match).toEqual({ id: 'original-candidate', name: 'Anna Julia Silva dos Santos' });
    expect(prismaMock.crm_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deleted_at: null, lead_type: 'TERRITORIAL_MANAGER', source: 'WEBSITE',
        phone: { in: ['+5521994542978', '5521994542978', '21994542978'] },
      },
    }));
    expect(prismaMock.whatsapp_invite_logs.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        target_phone_normalized: '+5521994542978', invite_type: 'manager_application',
      }),
    }));
  });

  it('never links the manually-created support lead', async () => {
    prismaMock.crm_leads.findMany.mockResolvedValue([]);
    expect(await resolveInvitedManagerApplicant('21994542978')).toBeNull();
    expect(prismaMock.whatsapp_invite_logs.findFirst).not.toHaveBeenCalled();
  });

  it('does not choose between two duplicate manager applications', async () => {
    prismaMock.crm_leads.findMany.mockResolvedValue([
      { id: 'one', name: 'A', phone: '21994542978' },
      { id: 'two', name: 'B', phone: '+5521994542978' },
    ]);
    expect(await resolveInvitedManagerApplicant('21994542978')).toBeNull();
    expect(prismaMock.whatsapp_invite_logs.findFirst).not.toHaveBeenCalled();
  });

  it('will not infer a candidate from unverified or failed invitation', async () => {
    prismaMock.whatsapp_invite_logs.findFirst.mockResolvedValue(null);
    expect(await resolveInvitedManagerApplicant('21994542978')).toBeNull();
  });
});
