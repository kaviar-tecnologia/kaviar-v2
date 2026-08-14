import { Request, Response } from 'express';
import { complianceService } from '../services/compliance.service';
import { z } from 'zod';

const createDocumentSchema = z.object({
  fileUrl: z.string().url('URL do arquivo inválida'),
  lgpdConsentAccepted: z.boolean(),
  lgpdConsentIp: z.string().optional()
});

const approveDocumentSchema = z.object({
  documentId: z.string()
});

const rejectDocumentSchema = z.object({
  documentId: z.string(),
  reason: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres')
});

export class ComplianceController {
  
  /**
   * POST /api/drivers/me/compliance/documents
   * Motorista envia novo documento
   */
  async createDocument(req: Request, res: Response) {
    try {
      const driverId = (req as any).driverId;
      
      if (!driverId) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado'
        });
      }

      const data = createDocumentSchema.parse(req.body);

      const document = await complianceService.createDocument({
        driverId,
        fileUrl: data.fileUrl,
        lgpdConsentAccepted: data.lgpdConsentAccepted,
        lgpdConsentIp: req.ip
      });

      res.json({
        success: true,
        data: document,
        message: 'Documento enviado para análise'
      });
    } catch (error) {
      console.error('Error creating compliance document:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao enviar documento'
      });
    }
  }

  /**
   * GET /api/drivers/me/compliance/documents
   * Motorista visualiza histórico de documentos
   */
  async getMyDocuments(req: Request, res: Response) {
    try {
      const driverId = (req as any).driverId;
      
      if (!driverId) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado'
        });
      }

      const documents = await complianceService.getDriverDocuments(driverId);

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      console.error('Error getting driver documents:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar documentos'
      });
    }
  }

  /**
   * GET /api/drivers/me/compliance/status
   * Motorista verifica status de revalidação
   */
  async getMyStatus(req: Request, res: Response) {
    try {
      const driverId = (req as any).driverId;
      
      if (!driverId) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado'
        });
      }

      const status = await complianceService.checkRevalidationStatus(driverId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error checking revalidation status:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao verificar status'
      });
    }
  }

  /**
   * GET /api/admin/compliance/documents/pending
   * Admin lista documentos pendentes
   */
  async getPendingDocuments(req: Request, res: Response) {
    try {
      const documents = await complianceService.getPendingDocuments();

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      console.error('Error getting pending documents:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar documentos pendentes'
      });
    }
  }

  /**
   * GET /api/admin/compliance/documents/expiring
   * Admin lista documentos vencendo
   */
  async getExpiringDocuments(req: Request, res: Response) {
    try {
      const documents = await complianceService.getDriversNeedingRevalidation();

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      console.error('Error getting expiring documents:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar documentos vencendo'
      });
    }
  }

  /**
   * GET /api/admin/compliance/drivers/:driverId/documents
   * Admin visualiza histórico de um motorista
   */
  async getDriverDocuments(req: Request, res: Response) {
    try {
      const { driverId } = req.params;

      const documents = await complianceService.getDriverDocuments(driverId);

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      console.error('Error getting driver documents:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar documentos'
      });
    }
  }

  /**
   * POST /api/admin/compliance/documents/:documentId/approve
   * Admin aprova documento
   */
  async approveDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const adminId = (req as any).userId;
      const emissionDate = req.body?.emission_date || req.body?.emissionDate || undefined;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado'
        });
      }

      const document = await complianceService.approveDocument({
        documentId,
        adminId,
        emissionDate,
      });

      res.json({
        success: true,
        data: document,
        message: 'Documento aprovado com sucesso'
      });
    } catch (error) {
      console.error('Error approving document:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao aprovar documento'
      });
    }
  }

  /**
   * POST /api/admin/compliance/documents/:documentId/reject
   * Admin rejeita documento
   */
  async rejectDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const adminId = (req as any).userId;
      const { reason } = rejectDocumentSchema.parse({ documentId, reason: req.body.reason });

      if (!adminId) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado'
        });
      }

      const document = await complianceService.rejectDocument({
        documentId,
        adminId,
        reason
      });

      res.json({
        success: true,
        data: document,
        message: 'Documento rejeitado'
      });
    } catch (error) {
      console.error('Error rejecting document:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao rejeitar documento'
      });
    }
  }
}

export const complianceController = new ComplianceController();
