import { PrismaClient } from '@prisma/client';
import { runRecurringAutomation } from './accounting-automation.service';
import { runReminders } from './accounting-reminders.service';

const prisma = new PrismaClient();

const SCHEDULER_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
const TARGET_HOUR_BRT = 7; // 7am Brasilia time (UTC-3 = 10:00 UTC)
const LOCK_KEY = 'daily_automation';

let schedulerRunning = false;

/**
 * Internal daily scheduler.
 * - Checks every hour if it's time to run (7am BRT, once per day)
 * - Uses DB lock to prevent concurrent execution
 * - Runs: automation (competencies + obligations) + reminders
 */
export function startScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.DISABLE_SCHEDULER === 'true') return;

  console.log('[SCHEDULER] Starting daily automation scheduler (target: 07:00 BRT)');

  // Run check immediately on startup, then every hour
  setTimeout(() => checkAndRun(), 10000); // 10s after startup
  setInterval(() => checkAndRun(), SCHEDULER_CHECK_INTERVAL);
}

async function checkAndRun() {
  if (schedulerRunning) return;

  try {
    // Get current time in São Paulo
    const now = new Date();
    const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = brt.getHours();
    const todayKey = `${brt.getFullYear()}-${String(brt.getMonth() + 1).padStart(2, '0')}-${String(brt.getDate()).padStart(2, '0')}`;

    // Only run after target hour
    if (currentHour < TARGET_HOUR_BRT) return;

    // Check if already ran today (DB lock)
    const lastRun = await prisma.accounting_automation_log.findFirst({
      where: { action: LOCK_KEY, created_at: { gte: new Date(todayKey + 'T00:00:00Z') } },
      orderBy: { created_at: 'desc' },
    });

    if (lastRun) return; // Already ran today

    // Acquire lock
    schedulerRunning = true;
    console.log(`[SCHEDULER] Running daily automation for ${todayKey}`);

    // Log start
    await prisma.accounting_automation_log.create({
      data: { legal_entity_id: '884907ff-5b04-4dfa-8613-a23216c5fa25', action: LOCK_KEY, details: { date: todayKey, started_at: now.toISOString() } },
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
  } catch (err: any) {
    console.error('[SCHEDULER] Error:', err.message);
    await prisma.accounting_automation_log.create({
      data: { legal_entity_id: '884907ff-5b04-4dfa-8613-a23216c5fa25', action: 'daily_automation_error', success: false, error_message: err.message },
    }).catch(() => {});
  } finally {
    schedulerRunning = false;
  }
}
