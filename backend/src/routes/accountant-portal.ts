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

export const accountantPortalRoutes = router;
export default router;
