import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { auditWrite } from '../middlewares/audit-write';

const router = Router();
const prisma = new PrismaClient();

// Apply authentication and role authorization to all routes
router.use(authenticateAdmin);
router.use(requireRole(['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']));

// Extend Request type to include admin
interface AuthRequest extends Request {
  admin?: {
    id: string;
    email: string;
    role: string;
  };
}

// GET /api/admin/community-leaders - List all leaders
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, neighborhood_id, city } = req.query;

    const where: any = {};
    if (status) where.verification_status = status;
    if (neighborhood_id) where.neighborhood_id = neighborhood_id;

    const leaders = await prisma.community_leaders.findMany({
      where,
      include: {
        neighborhood: {
          select: {
            id: true,
            name: true,
            city: true,
            zone: true
          }
        },
        community: {
          select: {
            id: true,
            name: true
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Filter by city if provided
    const filtered = city
      ? leaders.filter(l => l.neighborhood?.city === city)
      : leaders;

    res.json(filtered);
  } catch (error) {
    console.error('Error fetching leaders:', error);
    res.status(500).json({ error: 'Failed to fetch community leaders' });
  }
});

// POST /api/admin/community-leaders - Create new leader
router.post('/', auditWrite('create_community_leader', 'community_leader'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      email,
      phone,
      neighborhood_id,
      community_id,
      leader_type
    } = req.body;

    // Validate required fields
    if (!name || !email || !leader_type) {
      return res.status(400).json({
        error: 'Name, email, and leader_type are required'
      });
    }

    // Validate leader_type
    const validTypes = [
      'PRESIDENTE_ASSOCIACAO',
      'LIDER_RELIGIOSO',
      'COMERCIANTE_LOCAL',
      'AGENTE_SAUDE',
      'EDUCADOR',
      'OUTRO'
    ];
    if (!validTypes.includes(leader_type)) {
      return res.status(400).json({
        error: `Invalid leader_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const leader = await prisma.community_leaders.create({
      data: {
        name,
        email,
        phone,
        neighborhood_id,
        community_id,
        leader_type,
        verification_status: 'PENDING'
      },
      include: {
        neighborhood: true,
        community: true
      }
    });

    res.status(201).json(leader);
  } catch (error: any) {
    console.error('Error creating leader:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create community leader' });
  }
});

// PATCH /api/admin/community-leaders/:id/verify - Verify leader
router.patch('/:id/verify', auditWrite('verify_community_leader', 'community_leader'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        error: 'Status must be VERIFIED or REJECTED'
      });
    }

    const leader = await prisma.community_leaders.update({
      where: { id },
      data: {
        verification_status: status,
        verification_notes: notes,
        verified_by: req.admin?.id,
        verified_at: new Date()
      },
      include: {
        neighborhood: true,
        community: true,
        admin: {
          select: { name: true, email: true }
        }
      }
    });

    res.json(leader);
  } catch (error: any) {
    console.error('Error verifying leader:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Leader not found' });
    }
    res.status(500).json({ error: 'Failed to verify leader' });
  }
});

// PATCH /api/admin/community-leaders/:id - Update leader
router.patch('/:id', auditWrite('update_community_leader', 'community_leader'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, phone, neighborhood_id, community_id, is_active } = req.body;

    const leader = await prisma.community_leaders.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone !== undefined && { phone }),
        ...(neighborhood_id !== undefined && { neighborhood_id }),
        ...(community_id !== undefined && { community_id }),
        ...(is_active !== undefined && { is_active })
      },
      include: {
        neighborhood: true,
        community: true
      }
    });

    res.json(leader);
  } catch (error: any) {
    console.error('Error updating leader:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Leader not found' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update leader' });
  }
});

// DELETE /api/admin/community-leaders/:id - Delete leader
router.delete('/:id', auditWrite('delete_community_leader', 'community_leader'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.community_leaders.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting leader:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Leader not found' });
    }
    res.status(500).json({ error: 'Failed to delete leader' });
  }
});

export default router;
