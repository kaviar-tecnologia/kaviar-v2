import {
  afterEach, beforeEach, describe, expect, it, vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  findUnique: vi.fn(),
  driverUpdate: vi.fn(),
  verificationUpdate: vi.fn(),
  findFirst: vi.fn(),
  eligibility: vi.fn(),
  grantOnce: vi.fn()
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    drivers: {
      findUnique: mocks.findUnique
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const result = await fn({
        drivers: { update: mocks.driverUpdate },
        driver_verifications: {
          update: mocks.verificationUpdate
        },
        driver_documents: {
          findFirst: mocks.findFirst
        }
      });

      mocks.events.push('COMMIT');
      return result;
    }
  }
}));

vi.mock('../../src/services/driver-verification', () => ({
  DriverVerificationService: class {
    evaluateEligibility = mocks.eligibility;
  }
}));

vi.mock('../../src/services/driver-enforcement', () => ({
  DriverEnforcementService: class {}
}));

vi.mock('../../src/db', () => ({
  pool: {}
}));

vi.mock(
  '../../src/services/wallet-v2/driver-welcome-promo.service',
  () => ({
    DriverWelcomePromoService: class {
      grantOnce = mocks.grantOnce;
    }
  })
);

import { AdminService } from '../../src/modules/admin/service';

describe('KAVIAR — boas-vindas apos aprovacao oficial', () => {
  const originalFlag =
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;

    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'true';

    mocks.eligibility.mockResolvedValue({
      isEligible: true,
      missingRequirements: []
    });

    mocks.findUnique.mockResolvedValue({
      id: 'driver-test',
      status: 'pending',
      community_id: null
    });

    mocks.driverUpdate.mockImplementation(async () => {
      mocks.events.push('APPROVED');

      return {
        id: 'driver-test',
        status: 'approved'
      };
    });

    mocks.verificationUpdate.mockResolvedValue({});
    mocks.findFirst.mockResolvedValue(null);

    mocks.grantOnce.mockImplementation(async () => {
      mocks.events.push('WELCOME');

      return {
        granted: true,
        balanceCents: 2000n
      };
    });
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    } else {
      process.env.DRIVER_PERMANENT_WELCOME_ENABLED =
        originalFlag;
    }

    vi.restoreAllMocks();
  });

  it('concede somente apos confirmacao da aprovacao', async () => {
    const result = await new AdminService()
      .approveDriver('driver-test');

    expect(result.status).toBe('approved');

    expect(mocks.events).toEqual([
      'APPROVED',
      'COMMIT',
      'WELCOME'
    ]);

    expect(mocks.grantOnce).toHaveBeenCalledOnce();
    expect(mocks.grantOnce).toHaveBeenCalledWith(
      'driver-test'
    );
  });

  it('nao falha apos aprovar motorista de comunidade sem servico ativo', async () => {
    const warning = vi.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    mocks.findUnique.mockResolvedValue({
      id: 'driver-test',
      status: 'pending',
      community_id: 'community-test'
    });

    const result = await new AdminService()
      .approveDriver('driver-test');

    expect(result.status).toBe('approved');

    expect(mocks.events).toEqual([
      'APPROVED',
      'COMMIT',
      'WELCOME'
    ]);

    expect(warning).toHaveBeenCalledWith(
      '[COMMUNITY_ACTIVATION_UNAVAILABLE_AFTER_APPROVAL]',
      'community-test'
    );
  });

  it('nao concede se a aprovacao for recusada', async () => {
    mocks.eligibility.mockResolvedValue({
      isEligible: false,
      missingRequirements: ['CPF']
    });

    await expect(
      new AdminService().approveDriver('driver-test')
    ).rejects.toThrow();

    expect(mocks.driverUpdate).not.toHaveBeenCalled();
    expect(mocks.grantOnce).not.toHaveBeenCalled();
  });

  it('falha no bonus nao desfaz aprovacao confirmada', async () => {
    const log = vi.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mocks.grantOnce.mockRejectedValue(
      new Error('TEMPORARY_PROMO_FAILURE')
    );

    const result = await new AdminService()
      .approveDriver('driver-test');

    expect(result.status).toBe('approved');
    expect(mocks.events).toContain('COMMIT');
    expect(mocks.grantOnce).toHaveBeenCalledOnce();

    expect(log).toHaveBeenCalledWith(
      '[DRIVER_WELCOME_GRANT_FAILED]',
      'driver-test',
      'TEMPORARY_PROMO_FAILURE'
    );
  });

  it('nao concede com campanha desativada', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'false';

    const result = await new AdminService()
      .approveDriver('driver-test');

    expect(result.status).toBe('approved');
    expect(mocks.grantOnce).not.toHaveBeenCalled();
  });
});
