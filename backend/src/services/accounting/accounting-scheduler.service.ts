import { PrismaClient } from '@prisma/client';
import { runRecurringAutomation } from './accounting-automation.service';
import { runReminders } from './accounting-reminders.service';

const prisma = new PrismaClient();

const SCHEDULER_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
const TARGET_HOUR_BRT = 7; // 7am Brasilia time
const LOCK_ACTION = 'daily_automation';

let schedulerRunning = false;

/**
 * Internal daily scheduler.
 * - Checks every hour if it's time to run (7am BRT, once per day)
 * - Uses DB lock based on details.date (BRT logical date) — NOT created_at UTC
 * - Runs: automation (competencies + obligations) + reminders
 */
export function startScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.DISABLE_SCHEDULER === 'true') return;

  console.log('[SCHEDULER] Starting daily automation scheduler (target: 07:00 BRT)');

  setTimeout(() => checkAndRun(), 10000);
  setInterval(() => checkAndRun(), SCHEDULER_CHECK_INTERVAL);
}

/**
 * Get the current date string in America/Sao_Paulo timezone.
 */
function getTodayBRT(): { todayKey: string; currentHour: number } {
  const now = new Date();
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentHour = brt.getHours();
  const todayKey = `${brt.getFullYear()}-${String(brt.getMonth() + 1).padStart(2, '0')}-${String(brt.getDate()).padStart(2, '0')}`;
  return { todayKey, currentHour };
}

async function checkAndRun() {
  if (schedulerRunning) return;

  try {
    const { todayKey, currentHour } = getTodayBRT();

    // Only run after target hour
    if (currentHour < TARGET_HOUR_BRT) return;

    // Check if already ran today using details.date (BRT logical date)
    // This is the source of truth — NOT created_at which is UTC
    const alreadyRan = await prisma.accounting_automation_log.findFirst({
      where: {
        action: LOCK_ACTION,
        details: { path: ['date'], equals: todayKey },
      },
    });

    if (alreadyRan) return; // Already ran for this BRT date

    // Acquire lock (in-memory + DB)
    schedulerRunning = true;
    console.log(`[SCHEDULER] Running daily automation for ${todayKey}`);

    // Log start with BRT date as source of truth
    await prisma.accounting_automation_log.create({
      data: {
        legal_entity_id: '884907ff-5b04-4dfa-8613-a23216c5fa25',
        action: LOCK_ACTION,
        details: { date: todayKey, started_at: new Date().toISOString() },
      },
    });

    // Run automation
    const automationResult = await runRecurringAutomation();
    console.log('[SCHEDULER] Automation result:', JSON.stringify(automationResult));

    // Run reminders
    const reminderResult = await runReminders();
    console.log('[SCHEDULER] Reminders result:', JSON.stringify(reminderResult));

    // Log completion
    await prisma.accounting_automation_log.create({
      data: {
        legal_entity_id: '884907ff-5b04-4dfa-8613-a23216c5fa25',
        action: 'daily_automation_complete',
        details: { date: todayKey, automation: automationResult, reminders: reminderResult },
      },
    });

    console.log(`[SCHEDULER] Daily automation complete for ${todayKey}`);
  } catch (err: any) {
    console.error('[SCHEDULER] Error:', err.message);
    // Log failure — but do NOT create a lock entry, so it can retry
    await prisma.accounting_automation_log.create({
      data: {
        legal_entity_id: '884907ff-5b04-4dfa-8613-a23216c5fa25',
        action: 'daily_automation_error',
        success: false,
        error_message: err.message,
        details: { date: getTodayBRT().todayKey },
      },
    }).catch(() => {});
  } finally {
    schedulerRunning = false;
  }
}
