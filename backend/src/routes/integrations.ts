import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { notifyAdminNewContact } from '../services/admin-alert.service';
import { resolveInvitedManagerApplicant } from '../services/whatsapp/manager-applicant-link';

export const integrationsRoutes = Router();

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const URGENT_PATTERNS = [
  '⚠️ registro de emergência',
  'registro de emergencia',
  'emergência',
  'emergencia',
  'preciso de ajuda urgente',
  'socorro',
  'me ajuda por favor',
  'estou em perigo',
];

function detectUrgent(body: string): boolean {
  const lower = body.toLowerCase();
  return URGENT_PATTERNS.some(p => lower.includes(p));
}

/**
 * Resolve contact type and linked entity by phone number.
 * Order: driver → passenger → guide → consultant_lead → unknown
 */
async function resolveContact(phone: string): Promise<{
  contact_type: string;
  contact_name: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  assignee_id?: string | null;
}> {
  // Normalizar: remover whatsapp: prefix, manter só dígitos e +
  const clean = phone.replace('whatsapp:', '').trim();
  // Tentar match com e sem +55
  const variants = [clean];
  if (clean.startsWith('+55')) variants.push(clean.slice(3), clean.slice(1));
  if (clean.startsWith('55') && !clean.startsWith('+')) variants.push('+' + clean, clean.slice(2));
  if (!clean.startsWith('+') && !clean.startsWith('55')) variants.push('+55' + clean, '55' + clean);

  // Prefer a unique WEBSITE application after its official Twilio confirmation.
  // Never select a manual SUPPORT_POINT lead by matching only a phone suffix.
  const managerCandidate = await resolveInvitedManagerApplicant(phone);
  if (managerCandidate) return {
    contact_type: 'manager', contact_name: managerCandidate.name,
    linked_entity_type: 'crm_lead', linked_entity_id: managerCandidate.id,
  };

  // Driver
  const driver = await prisma.drivers.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, name: true },
  });
  if (driver) return { contact_type: 'driver', contact_name: driver.name, linked_entity_type: 'driver', linked_entity_id: driver.id };

  // Passenger
  const passenger = await prisma.passengers.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, name: true },
  });
  if (passenger) return { contact_type: 'passenger', contact_name: passenger.name, linked_entity_type: 'passenger', linked_entity_id: passenger.id };

  // Guide
  const guide = await prisma.tourist_guides.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, name: true },
  });
  if (guide) return { contact_type: 'guide', contact_name: guide.name, linked_entity_type: 'guide', linked_entity_id: guide.id };

  // Consultant lead
  const lead = await prisma.consultant_leads.findFirst({
    where: { phone: { in: variants }, status: { not: 'dismissed' } },
    select: { id: true, name: true },
  });
  if (lead) return { contact_type: 'lead', contact_name: lead.name, linked_entity_type: 'consultant_lead', linked_entity_id: lead.id };

  // Pet homologation (phone pode estar formatado diferente)
  const cleanDigits = clean.replace(/\D/g, '');
  const suffix9 = cleanDigits.slice(-9);
  if (suffix9.length === 9) {
    const petAll = await prisma.pet_homologations.findMany({
      where: { phone: { not: '' } },
      select: { id: true, name: true, phone: true, operator_id: true },
    });
    const petMatch = petAll.find(h => h.phone.replace(/\D/g, '').slice(-9) === suffix9);
    if (petMatch) return { contact_type: 'pet', contact_name: petMatch.name, linked_entity_type: 'pet_homologation', linked_entity_id: petMatch.id, assignee_id: petMatch.operator_id };
  }

  return { contact_type: 'unknown', contact_name: null, linked_entity_type: null, linked_entity_id: null };
}

// Twilio WhatsApp Inbound Webhook
integrationsRoutes.post('/twilio/whatsapp', async (req, res) => {
  // Acknowledge only after durable persistence, so Twilio can retry on storage failure.
  // No outbound reply is generated here.
  try {
    const { From, Body, MessageSid, ProfileName, MediaUrl0, MediaContentType0 } = req.body || {};
    if (!From || (!Body && !MediaUrl0)) {
      res.type('text/xml').status(200).send(EMPTY_TWIML);
      return;
    }

    const body = String(Body || (MediaUrl0 ? '[Mídia recebida]' : ''));
    const phone = String(From).replace('whatsapp:', '').trim();
    const twilioSid = MessageSid || null;
    const preview = body.substring(0, 200);

    // Dedup: se já existe mensagem com esse twilio_sid, ignorar
    if (twilioSid) {
      const existing = await prisma.wa_messages.findFirst({ where: { twilio_sid: twilioSid } });
      if (existing) {
        console.log(`[WA_INBOUND] Duplicate SID ${twilioSid}, skipping`);
        res.type('text/xml').status(200).send(EMPTY_TWIML);
        return;
      }
    }

    const isUrgent = detectUrgent(body);

    // Buscar ou criar conversa
    let conversation = await prisma.wa_conversations.findUnique({ where: { phone } });

    if (!conversation) {
      // Resolver contato
      const resolved = await resolveContact(phone);

      conversation = await prisma.wa_conversations.create({
        data: {
          phone,
          whatsapp_name: ProfileName || null,
          contact_name: resolved.contact_name,
          contact_type: resolved.contact_type,
          linked_entity_type: resolved.linked_entity_type,
          linked_entity_id: resolved.linked_entity_id,
          assignee_id: resolved.assignee_id || null,
          status: 'new',
          priority: isUrgent ? 'urgent' : 'normal',
          unread_count: 1,
          message_count: 1,
          last_message_at: new Date(),
          last_message_preview: preview,
          last_inbound_at: new Date(),
        },
      });

      console.log(`[WA_INBOUND] New conversation id=${conversation.id} phone=${phone.substring(0, 7)}*** type=${resolved.contact_type}${isUrgent ? ' URGENT' : ''}`);

      // Admin alert: notify via SMS on new conversation
      notifyAdminNewContact({
        phone,
        name: resolved.contact_name || ProfileName || null,
        message: body,
        type: resolved.contact_type,
        conversationId: conversation.id,
      }).catch(err => console.error('[ADMIN_ALERT] error:', err.message));
    } else {
      // Atualizar conversa existente
      const updates: any = {
        unread_count: { increment: 1 },
        message_count: { increment: 1 },
        last_message_at: new Date(),
        last_message_preview: preview,
        last_inbound_at: new Date(),
      };

      // Atualizar whatsapp_name se veio e ainda não tinha
      if (ProfileName && !conversation.whatsapp_name) {
        updates.whatsapp_name = ProfileName;
      }

      // Escalar para urgent se mensagem de emergência (nunca desescalar)
      if (isUrgent && conversation.priority !== 'urgent') {
        updates.priority = 'urgent';
      }

      // Se estava resolvida, reabrir
      if (conversation.status === 'resolved') {
        updates.status = 'new';
      }

      // Re-resolver contato se ainda é unknown
      if (conversation.contact_type === 'unknown' || (conversation.contact_type === 'lead' && !conversation.linked_entity_id)) {
        const resolved = await resolveContact(phone);
        if (resolved.contact_type !== 'unknown') {
          updates.contact_type = resolved.contact_type;
          updates.contact_name = resolved.contact_name;
          updates.linked_entity_type = resolved.linked_entity_type;
          updates.linked_entity_id = resolved.linked_entity_id;
        }
      }

      conversation = await prisma.wa_conversations.update({
        where: { id: conversation.id },
        data: updates,
      });
    }

    // Persistir mensagem
    await prisma.wa_messages.create({
      data: {
        conversation_id: conversation.id,
        direction: 'inbound',
        body,
        twilio_sid: twilioSid,
        media_url: MediaUrl0 || null,
        media_type: MediaContentType0 || null,
      },
    });

    console.log(`[WA_INBOUND] msg conv=${conversation.id} type=${conversation.contact_type} preview="${preview.substring(0, 40)}..."`);
    res.type('text/xml').status(200).send(EMPTY_TWIML);
  } catch (err) {
    console.error('[WA_INBOUND] Error persisting message:', err);
    if (!res.headersSent) res.status(503).send('Temporarily unavailable');
  }
});
