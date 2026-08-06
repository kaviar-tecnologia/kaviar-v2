import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Run recurring automation for all active configs.
 * Called by a scheduler (cron) or manually by admin.
 *
 * For each entity with active automation:
 * 1. Auto-create competency for current month (if not exists)
 * 2. Auto-create obligations from templates (if due date approaching)
 */
export async function runRecurringAutomation(): Promise<{ processed: number; created_competencies: number; created_obligations: number; errors: string[] }> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const errors: string[] = [];
  let createdCompetencies = 0;
  let createdObligations = 0;

  // Get all active automation configs
  const configs = await prisma.accounting_automation_config.findMany({
    where: { is_active: true },
    include: { legal_entity: { select: { id: true, razao_social: true } } },
  });

  for (const config of configs) {
    const entityId = config.legal_entity_id;

    try {
      // 1. Auto-create competency for current month
      if (config.auto_create_competency) {
        const existing = await prisma.accounting_competencies.findUnique({
          where: { legal_entity_id_year_month: { legal_entity_id: entityId, year: currentYear, month: currentMonth } },
        });

        if (!existing) {
          const deadlineDay = config.competency_deadline_day || 20;
          // Deadline: day X of the NEXT month
          const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
          const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
          const deadline = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(deadlineDay).padStart(2, '0')}`;

          await prisma.accounting_competencies.create({
            data: {
              legal_entity_id: entityId,
              month: currentMonth,
              year: currentYear,
              status: 'OPEN',
              expected_deadline: new Date(deadline + 'T12:00:00Z'),
              notes: '[Automação] Competência criada automaticamente',
            },
          });
          createdCompetencies++;

          await logAutomation(entityId, 'AUTO_CREATE_COMPETENCY', { month: currentMonth, year: currentYear });
        }
      }

      // 2. Auto-create obligations from templates
      if (config.auto_create_obligations) {
        const templates = await prisma.accounting_recurring_templates.findMany({
          where: { legal_entity_id: entityId, is_active: true },
        });

        for (const template of templates) {
          // Calculate due date for current month
          const dueDay = Math.min(template.day_of_month_due, daysInMonth(currentYear, currentMonth));
          const dueDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
          const dueDateObj = new Date(dueDate + 'T12:00:00Z');

          // Create X days before due date
          const createDate = new Date(dueDateObj.getTime() - template.days_before_due_to_create * 86400000);

          if (now >= createDate) {
            // Check if already created for this period (idempotent)
            const existing = await prisma.accounting_payment_obligations.findFirst({
              where: {
                legal_entity_id: entityId,
                description: template.description,
                competence_month: currentMonth,
                competence_year: currentYear,
                status: { notIn: ['CANCELED'] },
              },
            });

            if (!existing) {
              await prisma.accounting_payment_obligations.create({
                data: {
                  legal_entity_id: entityId,
                  obligation_type: template.obligation_type,
                  description: template.description,
                  beneficiary: template.beneficiary,
                  amount_cents: template.amount_cents,
                  due_date: dueDateObj,
                  competence_month: currentMonth,
                  competence_year: currentYear,
                  status: 'DRAFT',
                  action_owner: 'ACCOUNTANT',
                  notes: '[Automação] Criada a partir de modelo recorrente',
                },
              });
              createdObligations++;

              await logAutomation(entityId, 'AUTO_CREATE_OBLIGATION', {
                template_id: template.id,
                description: template.description,
                month: currentMonth,
                year: currentYear,
              });
            }
          }
        }
      }
    } catch (err: any) {
      const errMsg = `Entity ${entityId}: ${err.message}`;
      errors.push(errMsg);
      await logAutomation(entityId, 'AUTOMATION_ERROR', { error: err.message }, false, err.message);
    }
  }

  return { processed: configs.length, created_competencies: createdCompetencies, created_obligations: createdObligations, errors };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

async function logAutomation(entityId: string, action: string, details: any, success = true, errorMessage?: string) {
  await prisma.accounting_automation_log.create({
    data: { legal_entity_id: entityId, action, details, success, error_message: errorMessage || null },
  });
}

export { prisma };
