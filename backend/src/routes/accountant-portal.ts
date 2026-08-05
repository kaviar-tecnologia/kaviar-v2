import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// GET /dashboard — Portal do Contador: dados do dashboard
// ═══════════════════════════════════════════════════════════════════

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;

    // Get accountant with firm
    const acc = await prisma.accountants.findUnique({
      where: { id: accountant.id },
      include: { firm: true },
    });

    // Get linked entities
    const links = await prisma.accountant_entity_links.findMany({
      where: { accountant_id: accountant.id, status: 'ACTIVE' },
      include: { legal_entity: { select: { id: true, razao_social: true, cnpj: true, entity_type: true } } },
    });

    // Current month
    const now = new Date();
    const currentPeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    res.json({
      success: true,
      data: {
        accountant: {
          nome_completo: acc?.nome_completo,
          email: acc?.email,
          last_login_at: acc?.last_login_at,
        },
        firm: acc?.firm ? { razao_social: acc.firm.razao_social } : null,
        entities: links.map(l => ({
          id: l.legal_entity.id,
          razao_social: l.legal_entity.razao_social,
          entity_type: l.legal_entity.entity_type,
        })),
        currentPeriod,
        pendingDocuments: 0,
        sentThisMonth: 0,
        lastClosedPeriod: null,
      },
    });
  } catch (error) {
    console.error('[accountant-portal] dashboard error:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar dashboard' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /companies — Portal do Contador: lista de empresas vinculadas
// ═══════════════════════════════════════════════════════════════════

router.get('/companies', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const now = new Date();

    // Get all active links within valid period
    const links = await prisma.accountant_entity_links.findMany({
      where: {
        accountant_id: accountant.id,
        status: 'ACTIVE',
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
      include: {
        legal_entity: true,
      },
    });

    // For links with inherits_children=true on MATRIZ, also include filiais
    const matrizIdsWithInheritance = links
      .filter(l => l.inherits_children && l.legal_entity.entity_type === 'MATRIZ')
      .map(l => l.legal_entity_id);

    let filiais: any[] = [];
    if (matrizIdsWithInheritance.length > 0) {
      filiais = await prisma.legal_entities.findMany({
        where: {
          parent_entity_id: { in: matrizIdsWithInheritance },
          is_active: true,
        },
      });
    }

    // Build response
    const companies = links.map(link => ({
      id: link.legal_entity.id,
      razao_social: link.legal_entity.razao_social,
      nome_fantasia: link.legal_entity.nome_fantasia,
      cnpj: link.legal_entity.cnpj,
      entity_type: link.legal_entity.entity_type,
      uf: link.legal_entity.uf,
      municipio: link.legal_entity.municipio,
      is_active: link.legal_entity.is_active,
      scope: link.scope,
      inherits_children: link.inherits_children,
      permissions: {
        can_view: link.can_view,
        can_upload: link.can_upload,
        can_download: link.can_download,
        can_request_correction: link.can_request_correction,
        can_mark_processed: link.can_mark_processed,
        can_close_period: link.can_close_period,
      },
    }));

    // Add inherited filiais
    for (const filial of filiais) {
      if (!companies.find(c => c.id === filial.id)) {
        const parentLink = links.find(l => l.legal_entity_id === filial.parent_entity_id);
        if (parentLink) {
          companies.push({
            id: filial.id,
            razao_social: filial.razao_social,
            nome_fantasia: filial.nome_fantasia,
            cnpj: filial.cnpj,
            entity_type: filial.entity_type,
            uf: filial.uf,
            municipio: filial.municipio,
            is_active: filial.is_active,
            scope: parentLink.scope,
            inherits_children: false,
            permissions: {
              can_view: parentLink.can_view,
              can_upload: parentLink.can_upload,
              can_download: parentLink.can_download,
              can_request_correction: parentLink.can_request_correction,
              can_mark_processed: parentLink.can_mark_processed,
              can_close_period: parentLink.can_close_period,
            },
          });
        }
      }
    }

    res.json({ success: true, data: companies });
  } catch {
    res.status(500).json({ success: false, error: 'Erro ao carregar empresas' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /companies/:id — Portal do Contador: detalhes de empresa
// ═══════════════════════════════════════════════════════════════════

router.get('/companies/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { id } = req.params;
    const now = new Date();

    // Check direct link
    let link = await prisma.accountant_entity_links.findFirst({
      where: {
        accountant_id: accountant.id,
        legal_entity_id: id,
        status: 'ACTIVE',
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
    });

    // Check inherited access (filial of linked matriz)
    if (!link) {
      const entity = await prisma.legal_entities.findUnique({ where: { id } });
      if (entity?.parent_entity_id) {
        link = await prisma.accountant_entity_links.findFirst({
          where: {
            accountant_id: accountant.id,
            legal_entity_id: entity.parent_entity_id,
            status: 'ACTIVE',
            inherits_children: true,
            starts_at: { lte: now },
            OR: [{ ends_at: null }, { ends_at: { gt: now } }],
          },
        });
      }
    }

    if (!link) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

    const entity = await prisma.legal_entities.findUnique({
      where: { id },
      include: { parent: { select: { id: true, razao_social: true, cnpj: true } } },
    });

    if (!entity) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

    res.json({
      success: true,
      data: {
        id: entity.id,
        razao_social: entity.razao_social,
        nome_fantasia: entity.nome_fantasia,
        cnpj: entity.cnpj,
        entity_type: entity.entity_type,
        uf: entity.uf,
        municipio: entity.municipio,
        endereco: entity.endereco,
        codigo_interno: entity.codigo_interno,
        is_active: entity.is_active,
        parent: entity.parent,
        access: {
          scope: link.scope,
          inherits_children: link.inherits_children,
          starts_at: link.starts_at,
          ends_at: link.ends_at,
          permissions: {
            can_view: link.can_view,
            can_upload: link.can_upload,
            can_download: link.can_download,
            can_request_correction: link.can_request_correction,
            can_mark_processed: link.can_mark_processed,
            can_close_period: link.can_close_period,
          },
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Erro ao carregar empresa' });
  }
});

export const accountantPortalRoutes = router;
export default router;
