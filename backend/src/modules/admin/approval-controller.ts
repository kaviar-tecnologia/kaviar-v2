import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { z } from 'zod';
import { AdminService } from './service';

const approveDriverSchema = z.object({
  id: z.string()
});

const approveGuideSchema = z.object({
  id: z.string()
});

export class ApprovalController {
  
  // PUT /api/admin/drivers/:id/approve
  approveDriver = async (req: Request, res: Response) => {
    try {
      const { id } = approveDriverSchema.parse(req.params);
      
      const adminService = new AdminService();
      const driver = await adminService.approveDriver(id);

      res.json({
        success: true,
        data: driver,
        message: 'Motorista aprovado com sucesso'
      });
    } catch (err: any) {
      const code = err?.code || err?.error || (typeof err?.message === 'string' ? err.message : null);

      if (code === 'DRIVER_INCOMPLETE') {
        return res.status(400).json({
          success: false,
          error: 'DRIVER_INCOMPLETE',
          message: 'Motorista possui documentos obrigatórios pendentes',
          missingRequirements: err?.missingRequirements || [],
          details: err?.details || {}
        });
      }

      return res.status(400).json({
        success: false,
        error: code || 'BAD_REQUEST',
        message: err?.message || 'Falha ao aprovar motorista'
      });
    }
  };

  // PUT /api/admin/drivers/:id/reject
  rejectDriver = async (req: Request, res: Response) => {
    try {
      const { id } = approveDriverSchema.parse(req.params);
      
      // Find driver
      const driver = await prisma.drivers.findUnique({ where: { id } });
      if (!driver) {
        return res.status(404).json({
          success: false,
          error: 'Motorista não encontrado'
        });
      }

      // Update status to rejected
      const updatedDriver = await prisma.drivers.update({
        where: { id },
        data: {
          status: 'rejected',
          updated_at: new Date()
        }
      });

      res.json({
        success: true,
        data: {
          id: updatedDriver.id,
          name: updatedDriver.name,
          email: updatedDriver.email,
          status: updatedDriver.status
        },
        message: 'Motorista rejeitado'
      });
    } catch (error) {
      console.error('Error rejecting driver:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao rejeitar motorista'
      });
    }
  };

  // PUT /api/admin/guides/:id/approve
  approveGuide = async (req: Request, res: Response) => {
    try {
      const { id } = approveGuideSchema.parse(req.params);
      
      // Find guide
      const guide = await prisma.tourist_guides.findUnique({ where: { id } });
      if (!guide) {
        return res.status(404).json({
          success: false,
          error: 'Guia turístico não encontrado'
        });
      }

      // Update status to approved
      const updatedGuide = await prisma.tourist_guides.update({
        where: { id },
        data: {
          status: 'approved',
          updated_at: new Date()
        }
      });

      res.json({
        success: true,
        data: {
          id: updatedGuide.id,
          name: updatedGuide.name,
          email: updatedGuide.email,
          status: updatedGuide.status
        },
        message: 'Guia turístico aprovado com sucesso'
      });
    } catch (error) {
      console.error('Error approving guide:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao aprovar guia turístico'
      });
    }
  };

  // PUT /api/admin/guides/:id/reject
  rejectGuide = async (req: Request, res: Response) => {
    try {
      const { id } = approveGuideSchema.parse(req.params);
      
      // Find guide
      const guide = await prisma.tourist_guides.findUnique({ where: { id } });
      if (!guide) {
        return res.status(404).json({
          success: false,
          error: 'Guia turístico não encontrado'
        });
      }

      // Update status to rejected
      const updatedGuide = await prisma.tourist_guides.update({
        where: { id },
        data: {
          status: 'rejected',
          updated_at: new Date()
        }
      });

      res.json({
        success: true,
        data: {
          id: updatedGuide.id,
          name: updatedGuide.name,
          email: updatedGuide.email,
          status: updatedGuide.status
        },
        message: 'Guia turístico rejeitado'
      });
    } catch (error) {
      console.error('Error rejecting guide:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao rejeitar guia turístico'
      });
    }
  };

  // GET /api/admin/drivers - FONTE ÚNICA (Aprovação + Gerenciamento)
  getDrivers = async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      
      const where: any = { deleted_at: null };
      if (status) {
        where.status = status;
      }

      // Territory scope filter (injected by route handler for TERRITORIAL_OPERATOR/MANAGER)
      const scopeNeighborhoodFilter = (req as any).scopeNeighborhoodFilter as string[] | null;
      const scopeTerritoryFilter = (req as any).scopeTerritoryFilter as string[] | null;

      if (scopeNeighborhoodFilter && scopeNeighborhoodFilter.length > 0) {
        // Filtrar por neighborhoods do escopo — exclui drivers com neighborhood_id null
        where.neighborhood_id = { in: scopeNeighborhoodFilter };
      } else if (scopeTerritoryFilter && scopeTerritoryFilter.length > 0) {
        // Território sem bairros: filtrar via relação neighborhoods.territory_id
        // Exclui drivers sem neighborhood (neighborhood_id null)
        where.neighborhoods = { territory_id: { in: scopeTerritoryFilter } };
      }

      const drivers = await prisma.drivers.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          document_cpf: true,
          document_rg: true,
          document_cnh: true,
          vehicle_plate: true,
          vehicle_model: true,
          vehicle_color: true,
          neighborhood_id: true,
          community_id: true,
          pending_reason: true,
          created_at: true,
          updated_at: true,
          approved_at: true,
          rejected_at: true,
          neighborhoods: {
            select: { name: true }
          }
        },
        orderBy: { created_at: 'desc' }
      });

      // Normalize para frontend (camelCase + ISO dates)
      const normalized = drivers.map(d => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        status: d.status,
        documentCpf: d.document_cpf,
        documentRg: d.document_rg,
        documentCnh: d.document_cnh,
        vehiclePlate: d.vehicle_plate,
        vehicleModel: d.vehicle_model,
        vehicleColor: d.vehicle_color ?? null,
        neighborhoodId: d.neighborhood_id,
        neighborhoods: d.neighborhoods || null,
        communityId: d.community_id,
        pendingReason: d.pending_reason ?? null,
        createdAt: d.created_at?.toISOString() ?? null,
        updatedAt: d.updated_at?.toISOString(),
        approvedAt: d.approved_at?.toISOString() || null,
        rejectedAt: d.rejected_at?.toISOString() || null
      }));

      res.json({
        success: true,
        data: normalized
      });
    } catch (error) {
      console.error('Error getting drivers:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar motoristas'
      });
    }
  };

  // GET /api/admin/drivers/metrics/by-neighborhood
  getDriversByNeighborhood = async (req: Request, res: Response) => {
    try {
      // Construir filtro de território
      const scopeNeighborhoodFilter = (req as any).scopeNeighborhoodFilter as string[] | null;
      const scopeTerritoryFilter = (req as any).scopeTerritoryFilter as string[] | null;

      let neighborhoodBaseFilter: any = { not: null };

      if (scopeNeighborhoodFilter && scopeNeighborhoodFilter.length > 0) {
        neighborhoodBaseFilter = { in: scopeNeighborhoodFilter };
      } else if (scopeTerritoryFilter && scopeTerritoryFilter.length > 0) {
        // Território sem bairros: buscar neighborhoods vinculados ao território
        const territoryNeighborhoods = await prisma.neighborhoods.findMany({
          where: { territory_id: { in: scopeTerritoryFilter } },
          select: { id: true },
        });
        const ids = territoryNeighborhoods.map(n => n.id);
        if (ids.length === 0) {
          // Território sem nenhum bairro: retornar vazio
          return res.json({ success: true, data: [] });
        }
        neighborhoodBaseFilter = { in: ids };
      }

      const drivers = await prisma.drivers.groupBy({
        by: ['neighborhood_id', 'status'],
        _count: true,
        where: {
          neighborhood_id: neighborhoodBaseFilter
        }
      });

      // Premium Tourism Ativos
      const premiumTourismActive = await prisma.drivers.groupBy({
        by: ['neighborhood_id'],
        _count: true,
        where: {
          neighborhood_id: neighborhoodBaseFilter,
          premium_tourism_status: 'active'
        }
      });

      // Elegíveis (6 meses)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const eligible = await prisma.drivers.groupBy({
        by: ['neighborhood_id'],
        _count: true,
        where: {
          neighborhood_id: neighborhoodBaseFilter,
          status: 'approved',
          approved_at: { lte: sixMonthsAgo },
          premium_tourism_status: { not: 'active' }
        }
      });

      // Buscar nomes dos bairros
      const neighborhoodIds = [...new Set(drivers.map(d => d.neighborhood_id).filter(Boolean))];
      const neighborhoods = await prisma.neighborhoods.findMany({
        where: { id: { in: neighborhoodIds as string[] } },
        select: { id: true, name: true }
      });

      const neighborhoodMap = new Map(neighborhoods.map(n => [n.id, n.name]));
      const premiumMap = new Map(premiumTourismActive.map(p => [p.neighborhood_id, p._count]));
      const eligibleMap = new Map(eligible.map(e => [e.neighborhood_id, e._count]));

      // Agrupar por bairro
      const metrics = new Map<string, { 
        neighborhoodId: string; 
        name: string; 
        total: number; 
        approved: number; 
        pending: number;
        premiumTourismActive: number;
        eligible6Months: number;
      }>();

      drivers.forEach(d => {
        if (!d.neighborhood_id) return;
        
        if (!metrics.has(d.neighborhood_id)) {
          metrics.set(d.neighborhood_id, {
            neighborhoodId: d.neighborhood_id,
            name: neighborhoodMap.get(d.neighborhood_id) || 'Desconhecido',
            total: 0,
            approved: 0,
            pending: 0,
            premiumTourismActive: premiumMap.get(d.neighborhood_id) || 0,
            eligible6Months: eligibleMap.get(d.neighborhood_id) || 0
          });
        }

        const metric = metrics.get(d.neighborhood_id)!;
        metric.total += d._count;
        
        if (d.status === 'approved') {
          metric.approved += d._count;
        } else if (d.status === 'pending') {
          metric.pending += d._count;
        }
      });

      res.json({
        success: true,
        data: Array.from(metrics.values()).sort((a, b) => b.total - a.total)
      });
    } catch (error) {
      console.error('Error getting drivers by neighborhood:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar métricas'
      });
    }
  };

  // GET /api/admin/guides - List guides for approval
  getGuides = async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      
      const where: any = {};
      if (status) {
        where.status = status;
      }

      const guides = await prisma.tourist_guides.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          is_bilingual: true,
          languages: true,
          also_driver: true,
          created_at: true,
          updated_at: true
        },
        orderBy: { created_at: 'desc' }
      });

      res.json({
        success: true,
        data: guides
      });
    } catch (error) {
      console.error('Error getting guides:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao buscar guias turísticos'
      });
    }
  };
}
