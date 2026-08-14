import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Definição dos badges disponíveis
export const BADGE_DEFINITIONS = {
  local_hero: {
    code: 'local_hero',
    name: 'Herói Local',
    description: '80% das corridas no seu território',
    icon: '🏆',
    threshold: 80,
    benefit: 'Destaque no app para passageiros locais',
  },
  territory_master: {
    code: 'territory_master',
    name: 'Mestre do Território',
    description: '90% das corridas com taxa de 7% ou 12%',
    icon: '⭐',
    threshold: 90,
    benefit: 'Prioridade em corridas do seu bairro',
  },
  community_champion: {
    code: 'community_champion',
    name: 'Campeão da Comunidade',
    description: '100 corridas completadas no seu território',
    icon: '👑',
    threshold: 100,
    benefit: 'Badge especial no perfil',
  },
  efficiency_expert: {
    code: 'efficiency_expert',
    name: 'Expert em Eficiência',
    description: 'Taxa média abaixo de 10%',
    icon: '💎',
    threshold: 10,
    benefit: 'Economia máxima garantida',
  },
  consistent_performer: {
    code: 'consistent_performer',
    name: 'Desempenho Consistente',
    description: '4 semanas seguidas com 70%+ no território',
    icon: '🔥',
    threshold: 4,
    benefit: 'Bônus de consistência',
  },
};

/**
 * Calcula progresso de todos os badges para um motorista
 */
export async function calculateBadgeProgress(driverId: string) {
  // Buscar estatísticas das últimas 4 semanas
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const stats = await prisma.driver_territory_stats.findMany({
    where: {
      driver_id: driverId,
      period_start: { gte: fourWeeksAgo },
    },
    orderBy: { period_start: 'desc' },
  });

  if (stats.length === 0) {
    return Object.values(BADGE_DEFINITIONS).map((badge) => ({
      ...badge,
      unlocked: false,
      progress: 0,
    }));
  }

  // Agregar estatísticas
  const totalTrips = stats.reduce((sum, s) => sum + s.total_trips, 0);
  const insideTrips = stats.reduce((sum, s) => sum + s.inside_territory_trips, 0);
  const adjacentTrips = stats.reduce((sum, s) => sum + s.adjacent_territory_trips, 0);
  const avgFee =
    stats.reduce((sum, s) => sum + Number(s.avg_fee_percentage || 0), 0) / stats.length;

  // Calcular progresso de cada badge
  const progress = {
    local_hero: totalTrips > 0 ? Math.round((insideTrips / totalTrips) * 100) : 0,
    territory_master:
      totalTrips > 0 ? Math.round(((insideTrips + adjacentTrips) / totalTrips) * 100) : 0,
    community_champion: Math.min(100, Math.round((insideTrips / 100) * 100)),
    efficiency_expert: avgFee > 0 ? Math.max(0, Math.round(100 - avgFee * 10)) : 0,
    consistent_performer: Math.min(
      100,
      Math.round(
        (stats.filter((s) => {
          const rate =
            s.total_trips > 0 ? (s.inside_territory_trips / s.total_trips) * 100 : 0;
          return rate >= 70;
        }).length /
          4) *
          100
      )
    ),
  };

  // Buscar badges já desbloqueados
  const unlockedBadges = await prisma.driver_badges.findMany({
    where: { driver_id: driverId },
    select: { badge_type: true, unlocked_at: true },
  });

  const unlockedMap = new Map(
    unlockedBadges.map((b) => [b.badge_type, b.unlocked_at])
  );

  return Object.values(BADGE_DEFINITIONS).map((badge) => ({
    ...badge,
    unlocked: unlockedMap.has(badge.code),
    unlockedAt: unlockedMap.get(badge.code),
    progress: progress[badge.code as keyof typeof progress] || 0,
  }));
}

/**
 * Verifica e desbloqueia badges automaticamente
 */
export async function checkAndUnlockBadges(driverId: string) {
  const badgeProgress = await calculateBadgeProgress(driverId);
  const unlocked: string[] = [];

  for (const badge of badgeProgress) {
    if (!badge.unlocked && badge.progress >= badge.threshold) {
      try {
        await prisma.driver_badges.create({
          data: {
            driver_id: driverId,
            badge_type: badge.code,
            progress: badge.progress,
          },
        });
        unlocked.push(badge.code);
      } catch (error) {
        // Badge já existe (race condition)
        console.log(`Badge ${badge.code} já existe para driver ${driverId}`);
      }
    }
  }

  return unlocked;
}

/**
 * Busca badges do motorista
 */
export async function getDriverBadges(driverId: string) {
  const badges = await prisma.driver_badges.findMany({
    where: { driver_id: driverId },
    orderBy: { unlocked_at: 'desc' },
  });

  return badges.map((b) => ({
    ...BADGE_DEFINITIONS[b.badge_type as keyof typeof BADGE_DEFINITIONS],
    unlocked: true,
    unlockedAt: b.unlocked_at,
    progress: b.progress,

  }));
}

/**
 * Gera recomendação personalizada baseada em estatísticas
 */
export async function generateRecommendation(driverId: string) {
  const driver = await prisma.drivers.findUnique({
    where: { id: driverId },
    select: {
      territory_type: true,
      neighborhoods: {
        select: { name: true },
      },
    },
  });

  if (!driver) {
    return null;
  }

  // Estatísticas da última semana
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);

  const stats = await prisma.driver_territory_stats.findFirst({
    where: {
      driver_id: driverId,
      period_start: { gte: lastWeek },
    },
    orderBy: { period_start: 'desc' },
  });

  if (!stats || stats.total_trips === 0) {
    return {
      icon: '📍',
      title: 'Comece a Dirigir',
      message: 'Complete suas primeiras corridas para receber recomendações personalizadas.',
      type: 'info',
    };
  }

  const insideRate = (stats.inside_territory_trips / stats.total_trips) * 100;
  const outsideRate = (stats.outside_territory_trips / stats.total_trips) * 100;
  const avgFee = Number(stats.avg_fee_percentage || 0);

  // Recomendação baseada em desempenho
  if (outsideRate > 40) {
    const potentialSavings = Math.round((stats.potential_savings_cents || 0) / 100);
    return {
      icon: '⚠️',
      title: 'Oportunidade de Economia',
      message: `Você está fazendo ${outsideRate.toFixed(0)}% das corridas fora do seu território. Foque em corridas próximas a ${driver.neighborhoods?.name} para reduzir sua taxa média de ${avgFee.toFixed(1)}% para ${driver.territory_type === 'OFFICIAL' ? '7%' : '12%'}.`,
      potentialSavings: potentialSavings > 0 ? `R$ ${potentialSavings}/semana` : undefined,
      type: 'warning',
    };
  }

  if (insideRate >= 80) {
    return {
      icon: '🎉',
      title: 'Excelente Desempenho!',
      message: `Você está mantendo ${insideRate.toFixed(0)}% das corridas no seu território. Continue assim para manter sua taxa média baixa!`,
      type: 'success',
    };
  }

  if (avgFee > 15) {
    return {
      icon: '💡',
      title: 'Dica de Economia',
      message: `Sua taxa média está em ${avgFee.toFixed(1)}%. Aceite mais corridas próximas ao seu bairro para reduzir esse valor.`,
      type: 'tip',
    };
  }

  return {
    icon: '👍',
    title: 'Bom Trabalho',
    message: `Você está no caminho certo! Continue focando em corridas do seu território.`,
    type: 'success',
  };
}
