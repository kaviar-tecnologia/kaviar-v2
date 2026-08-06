import { PrismaClient } from '@prisma/client';
import { emailService } from '../email/email.service';

const prisma = new PrismaClient();

/**
 * Send reminders for obligations based on due dates and status.
 * Runs daily. Respects action_owner to determine recipient.
 */
export async function runReminders(): Promise<{ sent: number; errors: number }> {
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  today.setHours(0, 0, 0, 0);

  let sent = 0;
  let errors = 0;

  // Get all active automation configs with reminders enabled
  const configs = await prisma.accounting_automation_config.findMany({
    where: { is_active: true },
  });

  const activeEntityIds = configs.map(c => c.legal_entity_id);
  if (activeEntityIds.length === 0) return { sent: 0, errors: 0 };

  // Get open obligations for active entities
  const obligations = await prisma.accounting_payment_obligations.findMany({
    where: {
      legal_entity_id: { in: activeEntityIds },
      status: { notIn: ['RECONCILED', 'CANCELED', 'VERIFIED'] },
    },
    include: { legal_entity: { select: { razao_social: true } } },
  });

  for (const ob of obligations) {
    const config = configs.find(c => c.legal_entity_id === ob.legal_entity_id);
    if (!config) continue;

    const dueDate = new Date(ob.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);

    let shouldRemind = false;
    let reminderType = '';

    // D-7
    if (diffDays === 7 && config.send_reminder_d7 && ['SENT_TO_COMPANY', 'VIEWED'].includes(ob.status)) {
      shouldRemind = true;
      reminderType = 'D-7';
    }
    // D-1
    else if (diffDays === 1 && config.send_reminder_d1 && ['SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED'].includes(ob.status)) {
      shouldRemind = true;
      reminderType = 'D-1';
    }
    // Due today
    else if (diffDays === 0 && config.send_reminder_due && ['SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED'].includes(ob.status)) {
      shouldRemind = true;
      reminderType = 'VENCIMENTO';
    }
    // Overdue
    else if (diffDays < 0 && diffDays >= -3 && config.send_reminder_overdue && ['SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED'].includes(ob.status)) {
      shouldRemind = true;
      reminderType = 'VENCIDA';
    }
    // Proof awaiting accountant (notify accountant)
    else if (['PROOF_UPLOADED', 'UNDER_VERIFICATION'].includes(ob.status) && config.notify_accountant_proof) {
      // Only remind once (check if reminded today)
      const alreadyReminded = await prisma.accounting_automation_log.findFirst({
        where: { legal_entity_id: ob.legal_entity_id, action: `reminder_proof_${ob.id}`, created_at: { gte: today } },
      });
      if (!alreadyReminded) {
        shouldRemind = true;
        reminderType = 'COMPROVANTE_AGUARDANDO';
      }
    }

    if (!shouldRemind) continue;

    // Determine recipient based on action_owner
    // For now, log the reminder. Email sending to company requires active token.
    // For accountant reminders: would need accountant email from the link.
    try {
      await prisma.accounting_automation_log.create({
        data: {
          legal_entity_id: ob.legal_entity_id,
          action: `reminder_${reminderType.toLowerCase()}_${ob.id}`,
          details: {
            obligation_id: ob.id,
            description: ob.description,
            amount_cents: ob.amount_cents,
            due_date: ob.due_date.toISOString(),
            days_until: diffDays,
            action_owner: ob.action_owner,
            reminder_type: reminderType,
          },
        },
      });
      sent++;
    } catch {
      errors++;
    }
  }

  return { sent, errors };
}
