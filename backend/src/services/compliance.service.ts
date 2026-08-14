import { prisma } from '../lib/prisma';
import { z } from 'zod';

const REVALIDATION_PERIOD_MONTHS = 6;
const WARNING_DAYS = [30, 7];

export class ComplianceService {
  
  /**
   * Criar novo documento de compliance
   */
  async createDocument(data: {
    driverId: string;
    fileUrl: string;
    lgpdConsentAccepted: boolean;
    lgpdConsentIp?: string;
  }) {
    const { driverId, fileUrl, lgpdConsentAccepted, lgpdConsentIp } = data;

    if (!lgpdConsentAccepted) {
      throw new Error('Consentimento LGPD é obrigatório');
    }

    // Desativar documento atual (se existir)
    await prisma.driver_compliance_documents.updateMany({
      where: {
        driver_id: driverId,
        is_current: true
      },
      data: {
        is_current: false,
        updated_at: new Date()
      }
    });

    // Criar novo documento
    const document = await prisma.driver_compliance_documents.create({
      data: {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        driver_id: driverId,
        type: 'criminal_record',
        file_url: fileUrl,
        status: 'pending',
        is_current: false, // Será true após aprovação
        lgpd_consent_accepted: lgpdConsentAccepted,
        lgpd_consent_ip: lgpdConsentIp,
        lgpd_consent_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    return document;
  }

  /**
   * Aprovar documento
   */
  async approveDocument(data: {
    documentId: string;
    adminId: string;
    emissionDate?: string; // ISO date string YYYY-MM-DD
  }) {
    const { documentId, adminId, emissionDate } = data;

    const document = await prisma.driver_compliance_documents.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new Error('Documento não encontrado');
    }

    if (document.status !== 'pending') {
      throw new Error('Documento já foi processado');
    }

    // Validate emission_date if provided
    let parsedEmissionDate: Date | null = null;
    if (emissionDate) {
      parsedEmissionDate = new Date(emissionDate + 'T00:00:00Z');
      if (isNaN(parsedEmissionDate.getTime())) {
        throw new Error('Data de emissão inválida.');
      }
      if (parsedEmissionDate > new Date()) {
        throw new Error('Data de emissão não pode ser futura.');
      }
    } else {
      throw new Error('Data de emissão é obrigatória para novas aprovações.');
    }

    // Desativar documento atual do motorista
    await prisma.driver_compliance_documents.updateMany({
      where: {
        driver_id: document.driver_id,
        is_current: true
      },
      data: {
        is_current: false,
        updated_at: new Date()
      }
    });

    // Calcular validade: 6 meses a partir da emissão (obrigatória para novas aprovações)
    const baseDate = parsedEmissionDate!;
    const validFrom = new Date();
    const validUntil = new Date(baseDate.getTime());
    validUntil.setMonth(validUntil.getMonth() + REVALIDATION_PERIOD_MONTHS);

    // Aprovar e ativar novo documento
    const approved = await prisma.driver_compliance_documents.update({
      where: { id: documentId },
      data: {
        status: 'approved',
        is_current: true,
        valid_from: validFrom,
        valid_until: validUntil,
        emission_date: parsedEmissionDate,
        approved_by: adminId,
        approved_at: new Date(),
        updated_at: new Date()
      }
    });

    // Atualizar status do motorista se estava bloqueado
    await prisma.drivers.updateMany({
      where: {
        id: document.driver_id,
        status: 'blocked_compliance'
      },
      data: {
        status: 'approved',
        updated_at: new Date()
      }
    });

    return approved;
  }

  /**
   * Rejeitar documento
   */
  async rejectDocument(data: {
    documentId: string;
    adminId: string;
    reason: string;
  }) {
    const { documentId, adminId, reason } = data;

    if (!reason || reason.trim().length === 0) {
      throw new Error('Motivo da rejeição é obrigatório');
    }

    const document = await prisma.driver_compliance_documents.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new Error('Documento não encontrado');
    }

    if (document.status !== 'pending') {
      throw new Error('Documento já foi processado');
    }

    const rejected = await prisma.driver_compliance_documents.update({
      where: { id: documentId },
      data: {
        status: 'rejected',
        rejected_by: adminId,
        rejected_at: new Date(),
        rejection_reason: reason,
        updated_at: new Date()
      }
    });

    return rejected;
  }

  /**
   * Listar documentos de um motorista (histórico completo)
   */
  async getDriverDocuments(driverId: string) {
    const documents = await prisma.driver_compliance_documents.findMany({
      where: { driver_id: driverId },
      orderBy: { created_at: 'desc' }
    });

    return documents;
  }

  /**
   * Obter documento vigente de um motorista
   */
  async getCurrentDocument(driverId: string) {
    const document = await prisma.driver_compliance_documents.findFirst({
      where: {
        driver_id: driverId,
        is_current: true
      }
    });

    return document;
  }

  /**
   * Verificar se motorista precisa revalidar
   */
  async checkRevalidationStatus(driverId: string) {
    const current = await this.getCurrentDocument(driverId);

    if (!current) {
      return {
        needsRevalidation: true,
        daysUntilExpiration: null,
        status: 'no_document',
        message: 'Nenhum documento de antecedentes cadastrado'
      };
    }

    if (!current.valid_until) {
      return {
        needsRevalidation: false,
        daysUntilExpiration: null,
        status: 'valid',
        message: 'Documento válido'
      };
    }

    const now = new Date();
    const validUntil = new Date(current.valid_until);
    const daysUntilExpiration = Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiration <= 0) {
      return {
        needsRevalidation: true,
        daysUntilExpiration: 0,
        status: 'expired',
        message: 'Documento vencido. Envie um novo atestado.'
      };
    }

    if (daysUntilExpiration <= 7) {
      return {
        needsRevalidation: true,
        daysUntilExpiration,
        status: 'expiring_soon',
        message: `Seu atestado vence em ${daysUntilExpiration} dias. Envie um novo.`
      };
    }

    if (daysUntilExpiration <= 30) {
      return {
        needsRevalidation: false,
        daysUntilExpiration,
        status: 'warning',
        message: `Seu atestado vence em ${daysUntilExpiration} dias.`
      };
    }

    return {
      needsRevalidation: false,
      daysUntilExpiration,
      status: 'valid',
      message: 'Documento válido'
    };
  }

  /**
   * Listar motoristas com documentos vencendo
   */
  async getDriversNeedingRevalidation() {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const documents = await prisma.driver_compliance_documents.findMany({
      where: {
        is_current: true,
        valid_until: {
          lte: thirtyDaysFromNow
        }
      },
      include: {
        drivers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true
          }
        }
      },
      orderBy: {
        valid_until: 'asc'
      }
    });

    return documents;
  }

  /**
   * Listar documentos pendentes de aprovação
   */
  async getPendingDocuments() {
    const documents = await prisma.driver_compliance_documents.findMany({
      where: {
        status: 'pending'
      },
      include: {
        drivers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true
          }
        }
      },
      orderBy: {
        created_at: 'asc'
      }
    });

    return documents;
  }
}

export const complianceService = new ComplianceService();
