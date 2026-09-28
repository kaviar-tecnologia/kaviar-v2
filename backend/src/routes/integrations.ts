import { Router } from 'express';
import twilio from 'twilio';
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

/**
 * Twilio signs the exact public URL (including path and query) and form fields.
 * Explicit override is available for nonstandard proxy/public-domain routing.
 * Never log the auth token or signed payload.
 */
function validInboundSignature(req: any): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = String(req.headers['x-twilio-signature'] || '');
  const publicBase = process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL;
  const configured = process.env.TWILIO_WHATSAPP_INBOUND_WEBHOOK_URL;
  const url = configured?.trim() || (publicBase ? publicBase.replace(/\/$/, '') + req.originalUrl : '');
  if (!token || !signature || !url.startsWith('https://')) return false;
  try {
    return twilio.validateRequest(token, signature, url, req.body || {});
  } catch {
    return false;
  }
}

// Twilio WhatsApp Inbound Webhook — one persistent copy in the Central.
// No automated outgoing message, CRM status change, or business activation.
integrationsRoutes.post('/twilio/whatsapp', async (req, res) => {
  if (!validInboundSignature(req)) return res.status(403).send('Invalid Twilio signature');
  try {
    const { From, Body, MessageSid, ProfileName, MediaUrl0, MediaContentType0 } = req.body || {};
    if (!From || (!Body && !MediaUrl0)) return res.type('text/xml').status(200).send(EMPTY_TWIML);

    const body = String(Body || (MediaUrl0 ? '[Mídia recebida]' : ''));
    const phone = String(From).replace('whatsapp:', '').trim();
    const twilioSid = MessageSid || null;
    const preview = body.substring(0, 200);
    const isUrgent = detectUrgent(body);
    // Resolve contact outside the write transaction; do not consume another
    // Prisma connection inside an interactive transaction on small pools.
    const preexisting = await prisma.wa_conversations.findUnique({ where: { phone } });
    const resolved = !preexisting || (preexisting.contact_type === 'unknown' && !preexisting.linked_entity_id) || (preexisting.contact_type === 'lead' && !preexisting.linked_entity_id)
      ? await resolveContact(phone)
      : null;

    // One transaction: a failed message insert never leaves orphaned counters
    // or a phantom unread conversation. Twilio may retry a 503 response.
    const saved = await prisma.$transaction(async (tx) => {
      if (twilioSid) {
        const duplicate = await tx.wa_messages.findFirst({ where: { twilio_sid: twilioSid } });
        if (duplicate) return { duplicate: true as const, conversation: null, wasNew: false, resolvedName: null };
      }
      const existing = await tx.wa_conversations.findUnique({ where: { phone } });
      const wasNew = !existing;
      let conversation = existing;

      if (!conversation) {
        conversation = await tx.wa_conversations.create({
          data: {
            phone,
            whatsapp_name: ProfileName || null,
            contact_name: resolved?.contact_name || null,
            contact_type: resolved?.contact_type || 'unknown',
            linked_entity_type: resolved?.linked_entity_type || null,
            linked_entity_id: resolved?.linked_entity_id || null,
            assignee_id: resolved?.assignee_id || null,
            status: 'new',
            priority: isUrgent ? 'urgent' : 'normal',
            unread_count: 0,
            message_count: 0,
          },
        });
      }

      const updates: any = {
        unread_count: { increment: 1 },
        message_count: { increment: 1 },
        last_message_at: new Date(),
        last_message_preview: preview,
        last_inbound_at: new Date(),
      };
      if (ProfileName && !conversation.whatsapp_name) updates.whatsapp_name = ProfileName;
      if (isUrgent && conversation.priority !== 'urgent') updates.priority = 'urgent';
      if (conversation.status === 'resolved') updates.status = 'new';
      // Preserve explicit driver/passenger/other entity bindings. Only enrich
      // an unknown or unbound lead with a verified unique candidate.
      if (resolved && ((conversation.contact_type === 'unknown' && !conversation.linked_entity_id) || (conversation.contact_type === 'lead' && !conversation.linked_entity_id))) {
        if (resolved.contact_type !== 'unknown') {
          updates.contact_type = resolved.contact_type;
          updates.contact_name = resolved.contact_name;
          updates.linked_entity_type = resolved.linked_entity_type;
          updates.linked_entity_id = resolved.linked_entity_id;
        }
      }

      await tx.wa_messages.create({
        data: {
          conversation_id: conversation.id,
          direction: 'inbound',
          body,
          twilio_sid: twilioSid,
          media_url: MediaUrl0 || null,
          media_type: MediaContentType0 || null,
        },
      });
      conversation = await tx.wa_conversations.update({ where: { id: conversation.id }, data: updates });
      return { duplicate: false as const, conversation, wasNew, resolvedName: resolved?.contact_name || null };
    });

    if (saved.duplicate) {
      console.log('[WA_INBOUND] Duplicate SID ignored');
      return res.type('text/xml').status(200).send(EMPTY_TWIML);
    }
    if (saved.wasNew && saved.conversation) {
      notifyAdminNewContact({
        phone,
        name: saved.resolvedName || ProfileName || null,
        message: body,
        type: saved.conversation.contact_type,
        conversationId: saved.conversation.id,
      }).catch(err => console.error('[ADMIN_ALERT] error:', err.message));
    }
    console.log(`[WA_INBOUND] stored conv=${saved.conversation?.id} type=${saved.conversation?.contact_type}`);
    return res.type('text/xml').status(200).send(EMPTY_TWIML);
  } catch (err) {
    console.error('[WA_INBOUND] Error persisting message:', err);
    return res.status(503).send('Temporarily unavailable');
  }
});
