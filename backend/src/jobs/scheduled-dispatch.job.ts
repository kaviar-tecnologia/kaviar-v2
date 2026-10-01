import { prisma } from '../lib/prisma';
import { dispatcherService } from '../services/dispatcher.service';
import { whatsappEvents } from '../modules/whatsapp';
import { withSchedulerLock } from '../lib/scheduler-lock';
import { hasOfficialLockedQuote, officialQuoteSettlementSelect } from '../services/official-quote-readiness';

const LOCK_KEY = 'kaviar:scheduled_dispatch_job';
const DISPATCH_AHEAD_MINUTES = 10;
const REMINDER_AHEAD_MINUTES = 15;
const CHECK_INTERVAL_MS = 60_000;

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// Job que roda a cada 60 segundos para despachar corridas agendadas.
// O advisory lock garante que apenas uma instância executa por vez.
export function startScheduledDispatchJob() {
  setInterval(async () => {
    try {
      await withSchedulerLock(LOCK_KEY, async () => {
        const now = Date.now();
        const rides = await prisma.rides_v2.findMany({
          where: { status: 'scheduled', scheduled_for: { lte: new Date(now + REMINDER_AHEAD_MINUTES * 60_000) } },
          include: {
            passenger: { select: { phone: true, name: true } },
            settlement: { select: officialQuoteSettlementSelect },
          }
        });

        for (const ride of rides) {
          if (!ride.scheduled_for) continue;
          // Never present an unpriced scheduled ride as 'searching', or move
          // it into a dispatchable state. The dispatcher rechecks independently.
          if (!hasOfficialLockedQuote(ride)) {
            console.error(`[SCHEDULED_PRICING_BLOCKED] ride_id=${ride.id} reason=PRICING_QUOTE_UNAVAILABLE`);
            await prisma.rides_v2.updateMany({
              where: { id: ride.id, status: 'scheduled' },
              data: { status: 'no_driver' },
            });
            continue;
          }
          const td = (ride.trip_details as any) || {};
          const msUntil = ride.scheduled_for.getTime() - now;
          const timeStr = fmtTime(ride.scheduled_for);

          // Aviso 1: reminder ~15min antes (mas ainda não é hora de dispatch)
          if (msUntil > DISPATCH_AHEAD_MINUTES * 60_000 && !td._wa_reminder_sent) {
            if (ride.passenger?.phone) {
              whatsappEvents.rideScheduledReminder(ride.passenger.phone, {
                '1': ride.passenger.name || 'Passageiro',
                '2': timeStr,
              }).catch(e => console.error(`[WA_FAIL] scheduledReminder ride_id=${ride.id}`, e.message));
            }
            await prisma.rides_v2.update({
              where: { id: ride.id },
              data: { trip_details: { ...td, _wa_reminder_sent: true } }
            });
            console.log(`[SCHEDULED_REMINDER] ride_id=${ride.id} scheduled_for=${timeStr}`);
            continue; // don't dispatch yet
          }

          // Aviso 2 + dispatch: <=10min antes
          if (msUntil <= DISPATCH_AHEAD_MINUTES * 60_000) {
            console.log(`[SCHEDULED_DISPATCH] ride_id=${ride.id} scheduled_for=${ride.scheduled_for.toISOString()}`);
            const transitioned = await prisma.rides_v2.updateMany({
              where: { id: ride.id, status: 'scheduled' },
              data: { status: 'requested' },
            });
            if (transitioned.count !== 1) continue;

            if (ride.passenger?.phone && !td._wa_searching_sent) {
              whatsappEvents.rideScheduledSearching(ride.passenger.phone, {
                '1': ride.passenger.name || 'Passageiro',
                '2': timeStr,
              }).catch(e => console.error(`[WA_FAIL] scheduledSearching ride_id=${ride.id}`, e.message));
              await prisma.rides_v2.update({
                where: { id: ride.id },
                data: { trip_details: { ...td, _wa_reminder_sent: true, _wa_searching_sent: true } }
              });
            }

            dispatcherService.dispatchRide(ride.id).catch(err => {
              console.error(`[SCHEDULED_DISPATCH_ERROR] ride_id=${ride.id}`, err);
            });
          }
        }
      });
    } catch (error) {
      console.error('[SCHEDULED_DISPATCH_JOB_ERROR]', error);
    }
  }, CHECK_INTERVAL_MS);

  console.log(`[SCHEDULED_DISPATCH_JOB] Started (interval: ${CHECK_INTERVAL_MS / 1000}s, reminder: ${REMINDER_AHEAD_MINUTES}min, dispatch: ${DISPATCH_AHEAD_MINUTES}min)`);
}
