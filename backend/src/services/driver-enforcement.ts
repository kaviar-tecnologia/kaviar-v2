import { prisma } from '../lib/prisma';
import { config } from '../config';

export interface DriverStatusCheck {
  isBlocked: boolean;
  blockReason?: 'DELETED' | 'BANNED' | 'SUSPENDED';
  message?: string;
  details?: {
    deleted_at?: string;
    banned_at?: string;
    suspended_at?: string;
    reason?: string;
  };
}

export class DriverEnforcementService {

  /**
   * Check if driver is blocked from operations
   */
  async checkDriverStatus(driver_id: string): Promise<DriverStatusCheck> {
    // Skip enforcement if gates are disabled
    if (!config.driverEnforcement.enableEnforcementGates) {
      return { isBlocked: false };
    }

    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: {
        deleted_at: true,
        deleted_by: true,
        banned_at: true,
        banned_by: true,
        banned_reason: true,
        suspended_at: true,
        suspended_by: true,
        suspension_reason: true
      }
    });

    if (!driver) {
      return {
        isBlocked: true,
        blockReason: 'DELETED',
        message: 'Motorista não encontrado'
      };
    }

    // Check in order of severity: deleted > banned > suspended
    if (driver.deleted_at) {
      return {
        isBlocked: true,
        blockReason: 'DELETED',
        message: 'Conta removida do sistema',
        details: {
          deleted_at: driver.deleted_at.toISOString()
        }
      };
    }

    if (driver.banned_at) {
      return {
        isBlocked: true,
        blockReason: 'BANNED',
        message: 'Motorista banido permanentemente',
        details: {
          banned_at: driver.banned_at.toISOString(),
          reason: driver.banned_reason || 'Não especificado'
        }
      };
    }

    if (driver.suspended_at) {
      return {
        isBlocked: true,
        blockReason: 'SUSPENDED',
        message: 'Motorista temporariamente suspenso',
        details: {
          suspended_at: driver.suspended_at.toISOString(),
          reason: driver.suspension_reason || 'Não especificado'
        }
      };
    }

    return { isBlocked: false };
  }

  /**
   * Ban a driver
   */
  async banDriver(driver_id: string, reason: string, admin_id: string) {
    return prisma.$transaction(async (tx) => {
      const updatedDriver = await tx.drivers.update({
        where: { id: driver_id },
        data: {
          banned_at: new Date(),
          banned_by: admin_id,
          banned_reason: reason
        }
      });

      await tx.driver_enforcement_history.create({
        data: {
          id: `enforcement_${driver_id}_${Date.now()}`,
          driver_id,
          admin_id,
          action: 'BAN',
          reason,
          metadata: {
            previousStatus: 'active'
          }
        }
      });

      // Auto-revoke Excellence Seal on ban
      const seal = await tx.driver_badges.findUnique({ where: { driver_id_badge_code: { driver_id, badge_code: 'EXCELLENCE_SEAL' } } });
      if (seal) {
        await tx.driver_badges.delete({ where: { driver_id_badge_code: { driver_id, badge_code: 'EXCELLENCE_SEAL' } } });
        await tx.driver_badge_events.create({ data: { driver_id, badge_code: 'EXCELLENCE_SEAL', event_type: 'REVOKED', reason: 'Banimento do motorista', admin_id } });
      }

      return updatedDriver;
    });
  }

  /**
   * Unban a driver
   */
  async unbanDriver(driver_id: string, admin_id: string) {
    return prisma.$transaction(async (tx) => {
      const updatedDriver = await tx.drivers.update({
        where: { id: driver_id },
        data: {
          banned_at: null,
          banned_by: null,
          banned_reason: null
        }
      });

      await tx.driver_enforcement_history.create({
        data: {
          id: `enforcement_${driver_id}_${Date.now()}`,
          driver_id,
          admin_id,
          action: 'UNBAN',
          reason: 'Banimento removido por admin'
        }
      });

      return updatedDriver;
    });
  }

  /**
   * Soft delete a driver
   */
  async softDeleteDriver(driver_id: string, admin_id: string) {
    return prisma.$transaction(async (tx) => {
      const updatedDriver = await tx.drivers.update({
        where: { id: driver_id },
        data: {
          deleted_at: new Date(),
          deleted_by: admin_id
        }
      });

      await tx.driver_enforcement_history.create({
        data: {
          id: `enforcement_${driver_id}_${Date.now()}`,
          driver_id,
          admin_id,
          action: 'SOFT_DELETE',
          reason: 'Conta removida do sistema'
        }
      });

      return updatedDriver;
    });
  }

  /**
   * Restore a soft deleted driver
   */
  async restoreDriver(driver_id: string, admin_id: string) {
    return prisma.$transaction(async (tx) => {
      const updatedDriver = await tx.drivers.update({
        where: { id: driver_id },
        data: {
          deleted_at: null,
          deleted_by: null
        }
      });

      await tx.driver_enforcement_history.create({
        data: {
          id: `enforcement_${driver_id}_${Date.now()}`,
          driver_id,
          admin_id,
          action: 'RESTORE',
          reason: 'Conta restaurada por admin'
        }
      });

      return updatedDriver;
    });
  }

  /**
   * Get enforcement history for a driver
   */
  async getEnforcementHistory(driver_id: string) {
    return prisma.driver_enforcement_history.findMany({
      where: { driver_id },
      orderBy: { created_at: 'desc' },
      take: 50 // Last 50 actions
    });
  }

  /**
   * Enhanced suspend with audit trail
   */
  async suspendDriverWithAudit(driver_id: string, reason: string, admin_id: string) {
    return prisma.$transaction(async (tx) => {
      const updatedDriver = await tx.drivers.update({
        where: { id: driver_id },
        data: {
          status: 'suspended',
          suspension_reason: reason,
          suspended_at: new Date(),
          suspended_by: admin_id
        }
      });

      await tx.driver_enforcement_history.create({
        data: {
          id: `enforcement_${driver_id}_${Date.now()}`,
          driver_id,
          admin_id,
          action: 'SUSPEND',
          reason
        }
      });

      return updatedDriver;
    });
  }

  /**
   * Enhanced reactivate with audit trail
   */
  async reactivateDriverWithAudit(driver_id: string, admin_id: string) {
    return prisma.$transaction(async (tx) => {
      const updatedDriver = await tx.drivers.update({
        where: { id: driver_id },
        data: {
          status: 'approved',
          suspension_reason: null,
          suspended_at: null,
          suspended_by: null
        }
      });

      await tx.driver_enforcement_history.create({
        data: {
          id: `enforcement_${driver_id}_${Date.now()}`,
          driver_id,
          admin_id,
          action: 'REACTIVATE',
          reason: 'Suspensão removida por admin'
        }
      });

      return updatedDriver;
    });
  }
}
