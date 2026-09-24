import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { prisma } from '../lib/prisma';
import { COMPANY } from '../config/company';
import { WhatsAppService } from '../modules/whatsapp/whatsapp.service';
import { getWhatsAppContentSid } from '../modules/whatsapp/whatsapp-templates';

const router = Router();
const wa = new WhatsAppService();

const ALLOWED_ROLES = ['SUPER_ADMIN', 'TERRITORIAL_MANAGER'];
const DEFAULT_DOC_VERSION = 'v1.0';
const REGULATORY_TEMPLATE_KEY = 'kaviar_regulatory_consultation_v1';
const TWILIO_CONTENT_SID_RE = /^HX[a-fA-F0-9]{32}$/;
const INVALID_CONTENT_SID_MESSAGE = 'ContentSid do template Twilio não configurado ou inválido.';
const PDF_HEADER_LINES = [
  'KAVIAR',
  'KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA',
  'CNPJ: 67.783.601/0001-99',
  'contato@kaviar.com.br | +55 21 96864-8777',
  'https://kaviar.com.br',
];

function normalizeBrazilPhone(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) throw new Error('Informe um telefone válido.');

  let normalized = digits;
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('55')) normalized = normalized.slice(2);

  if (normalized.length !== 10 && normalized.length !== 11) {
    throw new Error('Informe um telefone brasileiro com DDD.');
  }

  return `+55${normalized}`;
}

function protocolFromNow(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KVR-RM-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${rand}`;
}

function formatCnpj(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length !== 14) return String(input || '').trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function resolveRegulatoryLogoPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../assets/kaviar-logo.jpg'),
    path.resolve(process.cwd(), 'assets/kaviar-logo.jpg'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Keep silent and try next candidate.
    }
  }

  return null;
}

function statusTimestamp(status: string): Record<string, Date> {
  const now = new Date();
  if (status === 'sent') return { sent_at: now };
  if (status === 'delivered') return { delivered_at: now };
  if (status === 'read') return { read_at: now };
  if (status === 'failed' || status === 'undelivered') return { failed_at: now };
  return {};
}

function serializeLog(log: any) {
  return {
    id: log.id,
    adminId: log.admin_id,
    adminName: log.admin_name,
    adminEmail: log.admin_email,
    adminRole: log.admin_role,
    territoryId: log.territory_id,
    destinationPhone: log.destination_phone,
    recipientName: log.recipient_name,
    organizationName: log.organization_name,
    municipalityName: log.municipality_name,
    documentVersion: log.document_version,
    protocolCode: log.protocol_code,
    observation: log.observation,
    templateKey: log.template_key,
    twilioMessageSid: log.twilio_message_sid,
    twilioStatus: log.twilio_status,
    twilioErrorCode: log.twilio_error_code,
    twilioErrorMessage: log.twilio_error_message,
    sourceScreen: log.source_screen,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
    sentAt: log.sent_at,
    deliveredAt: log.delivered_at,
    readAt: log.read_at,
    failedAt: log.failed_at,
  };
}

type RegulatoryDocInput = {
  organizationName: string;
  municipalityName: string;
  recipientName?: string | null;
  cnpj?: string | null;
  legalRepresentative?: string | null;
  observation?: string | null;
  documentVersion?: string | null;
  protocolCode?: string | null;
};

function buildRegulatoryDocument(input: RegulatoryDocInput) {
  const protocolCode = (input.protocolCode || '').trim() || protocolFromNow();
  const generatedAt = new Date();
  const formattedDate = generatedAt.toLocaleDateString('pt-BR');
  const formattedTime = generatedAt.toLocaleTimeString('pt-BR');

  const organizationName = input.organizationName.trim();
  const municipalityName = input.municipalityName.trim();
  const recipientName = (input.recipientName || '').trim();
  const cnpj = formatCnpj((input.cnpj || '').trim());
  const legalRepresentative = (input.legalRepresentative || '').trim();
  const observation = (input.observation || '').trim();
  const documentVersion = (input.documentVersion || DEFAULT_DOC_VERSION).trim() || DEFAULT_DOC_VERSION;

  const recipientLine = recipientName ? `A/C: ${recipientName}` : 'A/C: Setor responsável';

  const text = [
    'CONSULTA REGULATÓRIA MUNICIPAL - KAVIAR',
    `Versão do documento: ${documentVersion}`,
    `Protocolo interno: ${protocolCode}`,
    `Gerado em: ${formattedDate} ${formattedTime}`,
    '',
    `Empresa solicitante: ${COMPANY.legalName}`,
    `Nome fantasia: ${COMPANY.tradeName}`,
    `CNPJ da solicitante: ${COMPANY.cnpj}`,
    `Endereço legal: ${COMPANY.legalAddress}`,
    `Contato institucional: ${COMPANY.email} | ${COMPANY.phone}`,
    '',
    `Organização consultada: ${organizationName}`,
    recipientLine,
    `Município de referência: ${municipalityName}`,
    cnpj ? `CNPJ informado: ${cnpj}` : 'CNPJ informado: não informado',
    legalRepresentative ? `Representante legal informado: ${legalRepresentative}` : 'Representante legal informado: não informado',
    '',
    'Objeto da consulta:',
    'Solicitamos validação e orientação institucional sobre requisitos municipais para operação da KAVIAR no território indicado, incluindo autorizações, credenciamentos e restrições aplicáveis ao modelo de atendimento digital.',
    '',
    'Questionário objetivo (Seguro APP e coberturas operacionais):',
    '1) Há exigência formal de Seguro APP para operação de transporte por aplicativo no município?',
    '2) Se houver, quais os valores mínimos exigidos por cobertura (morte, invalidez e despesas médicas)?',
    '3) Para modalidade moto passageiro, existe exigência específica de cobertura securitária adicional ou distinta?',
    '4) Há exigência de seguro de responsabilidade civil facultativa (RC-F) para operação da plataforma ou condutores?',
    '5) Quais documentos de seguro devem ser apresentados pela empresa operadora e/ou pelos motoristas para conformidade local?',
    '',
    'Declaração institucional:',
    'Esta comunicação possui finalidade exclusivamente informativa e de diligência regulatória. Não constitui início de operação sem requisitos locais e não substitui parecer jurídico ou ato administrativo competente.',
    'O gestor territorial poderá protocolar ou acompanhar localmente esta solicitação somente quando houver autorização expressa da KAVIAR para o ato específico. Essa autorização operacional não confere poderes gerais de representação, contratação, assunção de obrigações ou manifestação jurídica, regulatória ou financeira em nome da KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA.',
    '',
    observation ? `Observação operacional: ${observation}` : 'Observação operacional: sem observações adicionais.',
    '',
    'Canal para resposta oficial',
    '',
    'Solicitamos que a resposta oficial, orientação, exigência documental, indicação de órgão competente ou qualquer manifestação administrativa relacionada a esta consulta seja enviada preferencialmente para:',
    '',
    'E-mail institucional: contato@kaviar.com.br',
    '',
    'Caso a Prefeitura ou o órgão municipal utilize sistema próprio de protocolo eletrônico, solicitamos a gentileza de informar o número do protocolo, o setor responsável e o canal oficial para acompanhamento da solicitação.',
    '',
    'Canal complementar para contato:',
    'WhatsApp institucional: +55 21 96864-8777',
    'Site: https://kaviar.com.br',
    '',
    'Aparecido de Góes',
    'Representante institucional da KAVIAR',
    '',
    'KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA',
    'CNPJ: 67.783.601/0001-99',
    'Rio de Janeiro/RJ — Atendimento digital',
  ].join('\n');

  return {
    protocolCode,
    documentVersion,
    generatedAt,
    text,
    whatsappTemplateVariables: {
      '1': organizationName,
      '2': municipalityName,
      '3': protocolCode,
      '4': documentVersion,
    },
  };
}

function checkTemplateReady() {
  const sid = getWhatsAppContentSid(REGULATORY_TEMPLATE_KEY);
  const normalizedSid = (sid || '').trim();

  if (TWILIO_CONTENT_SID_RE.test(normalizedSid)) {
    return { ready: true, sidMasked: `${sid.slice(0, 4)}***${sid.slice(-4)}` };
  }

  return {
    ready: false,
    error: INVALID_CONTENT_SID_MESSAGE,
    missing: ['TWILIO_KAVIAR_REGULATORY_TEMPLATE_SID'],
  };
}

function resolveTerritoryForLog(admin: any, scope: any): string | null {
  if (admin.role === 'SUPER_ADMIN') return null;
  const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
  return territoryIds[0] || null;
}

function validateInput(body: any): { ok: true; payload: RegulatoryDocInput } | { ok: false; error: string } {
  const organizationName = String(body?.organizationName || '').trim();
  const municipalityName = String(body?.municipalityName || '').trim();

  if (!organizationName) return { ok: false, error: 'organizationName e obrigatorio.' };
  if (!municipalityName) return { ok: false, error: 'municipalityName e obrigatorio.' };

  return {
    ok: true,
    payload: {
      organizationName,
      municipalityName,
      recipientName: body?.recipientName || null,
      cnpj: body?.cnpj || null,
      legalRepresentative: body?.legalRepresentative || null,
      observation: body?.observation || null,
      documentVersion: body?.documentVersion || DEFAULT_DOC_VERSION,
      protocolCode: body?.protocolCode || null,
    },
  };
}

router.get('/config', authenticateAdmin, requireRole(ALLOWED_ROLES), applyTerritoryScope, async (_req: Request, res: Response) => {
  const template = checkTemplateReady();
  return res.json({ success: true, data: { template, defaultDocumentVersion: DEFAULT_DOC_VERSION } });
});

router.post('/preview', authenticateAdmin, requireRole(ALLOWED_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  const parsed = validateInput(req.body);
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

  const doc = buildRegulatoryDocument(parsed.payload);
  return res.json({
    success: true,
    data: {
      protocolCode: doc.protocolCode,
      documentVersion: doc.documentVersion,
      generatedAt: doc.generatedAt,
      text: doc.text,
      company: {
        legalName: COMPANY.legalName,
        tradeName: COMPANY.tradeName,
        cnpj: COMPANY.cnpj,
        email: COMPANY.email,
        phone: COMPANY.phone,
        website: COMPANY.website,
      },
    },
  });
});

router.post('/pdf', authenticateAdmin, requireRole(ALLOWED_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  const parsed = validateInput(req.body);
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

  const docData = buildRegulatoryDocument(parsed.payload);
  const safeProtocol = docData.protocolCode.replace(/[^A-Za-z0-9-]/g, '');
  const logoPath = resolveRegulatoryLogoPath();

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 48 });

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename=consulta-regulatoria-${safeProtocol}.pdf`);
  doc.pipe(res);

  const margin = 48;
  const contentWidth = 499;

  // Draw watermark first to keep the document text readable on top.
  doc.save();
  doc.fillColor('#D4D4D8').opacity(0.08).font('Helvetica-Bold').fontSize(92);
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2;
  doc.rotate(-28, { origin: [centerX, centerY] });
  doc.text('KAVIAR', centerX - 210, centerY - 30, { width: 420, align: 'center' });
  doc.restore();
  doc.opacity(1);

  if (logoPath) {
    try {
      doc.image(logoPath, margin, margin - 6, { fit: [72, 72] });
    } catch {
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text('KAVIAR', margin, margin + 8);
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text('KAVIAR', margin, margin + 8);
  }

  const headerX = margin + 84;
  let headerY = margin - 2;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(PDF_HEADER_LINES[0], headerX, headerY, { width: 415 });
  headerY += 16;
  doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
  for (const line of PDF_HEADER_LINES.slice(1)) {
    doc.text(line, headerX, headerY, { width: 415 });
    headerY += 12;
  }

  doc.moveTo(margin, margin + 78).lineTo(547, margin + 78).stroke('#D1D5DB');
  doc.y = margin + 90;

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111').text('Consulta Regulatória Municipal — KAVIAR', margin, doc.y, { width: contentWidth });
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`Protocolo: ${docData.protocolCode}`);
  doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`Versão: ${docData.documentVersion}`);
  doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`Gerado em: ${docData.generatedAt.toLocaleString('pt-BR')}`);
  doc.moveDown(0.8);

  doc.font('Helvetica').fontSize(10).fillColor('#1F2937').text(docData.text, {
    width: 499,
    lineGap: 3,
  });

  const footerY = doc.page.height - 70;
  doc.moveTo(margin, footerY - 10).lineTo(547, footerY - 10).stroke('#E5E7EB');
  doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text('Documento institucional informativo. Não substitui parecer jurídico ou ato administrativo competente.', margin, footerY, {
    width: contentWidth,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF').text('KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA | CNPJ: 67.783.601/0001-99', margin, footerY + 12, {
    width: contentWidth,
    align: 'center',
  });

  doc.end();
});

router.post('/send', authenticateAdmin, requireRole(ALLOWED_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;

    const parsed = validateInput(req.body);
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

    const destinationPhone = normalizeBrazilPhone(String(req.body?.destinationPhone || req.body?.phone || ''));
    const templateCheck = checkTemplateReady();
    if (!templateCheck.ready) {
      return res.status(400).json({ success: false, error: templateCheck.error, missing: (templateCheck as any).missing || [] });
    }

    const docData = buildRegulatoryDocument(parsed.payload);

    const log = await prisma.municipal_regulatory_consultation_logs.create({
      data: {
        admin_id: admin.id,
        admin_name: admin.name || null,
        admin_email: admin.email || null,
        admin_role: admin.role,
        territory_id: resolveTerritoryForLog(admin, scope),
        destination_phone: destinationPhone,
        recipient_name: parsed.payload.recipientName || null,
        organization_name: parsed.payload.organizationName,
        municipality_name: parsed.payload.municipalityName,
        document_version: docData.documentVersion,
        protocol_code: docData.protocolCode,
        observation: parsed.payload.observation || null,
        template_key: REGULATORY_TEMPLATE_KEY,
        twilio_status: 'queued',
      },
    });

    try {
      const sendResult = await wa.sendTemplate({
        to: destinationPhone,
        template: REGULATORY_TEMPLATE_KEY,
        variables: docData.whatsappTemplateVariables,
      });

      if ((sendResult as any)?.skipped) {
        await prisma.municipal_regulatory_consultation_logs.update({
          where: { id: log.id },
          data: {
            twilio_status: 'failed',
            twilio_error_message: 'TWILIO_WHATSAPP_ENABLED=false no backend.',
            failed_at: new Date(),
          },
        });
        return res.status(503).json({ success: false, error: 'Envio WhatsApp desativado no backend (TWILIO_WHATSAPP_ENABLED=false).' });
      }

      const updated = await prisma.municipal_regulatory_consultation_logs.update({
        where: { id: log.id },
        data: {
          twilio_message_sid: sendResult.sid,
          twilio_status: 'sent',
          ...statusTimestamp('sent'),
        },
      });

      return res.json({
        success: true,
        message: 'Consulta Regulatoria enviada via WhatsApp e registrada com sucesso.',
        data: serializeLog(updated),
      });
    } catch (sendErr: any) {
      const failed = await prisma.municipal_regulatory_consultation_logs.update({
        where: { id: log.id },
        data: {
          twilio_status: 'failed',
          twilio_error_code: sendErr?.code ? String(sendErr.code) : null,
          twilio_error_message: sendErr?.message || 'Falha ao chamar Twilio.',
          failed_at: new Date(),
        },
      });

      return res.status(502).json({
        success: false,
        error: sendErr?.message || 'Twilio nao conseguiu enviar a consulta regulatoria.',
        data: serializeLog(failed),
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao enviar consulta regulatoria.' });
  }
});

router.get('/logs', authenticateAdmin, requireRole(ALLOWED_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;

    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const where: any = {};

    if (admin.role !== 'SUPER_ADMIN') {
      const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
      if (territoryIds.length) where.territory_id = { in: territoryIds };
      else where.admin_id = admin.id;
    }

    if (req.query.phone) where.destination_phone = { contains: String(req.query.phone).replace(/\D/g, '') };
    if (req.query.protocolCode) where.protocol_code = { contains: String(req.query.protocolCode) };
    if (req.query.status) where.twilio_status = String(req.query.status);

    const [logs, total] = await Promise.all([
      prisma.municipal_regulatory_consultation_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.municipal_regulatory_consultation_logs.count({ where }),
    ]);

    return res.json({
      success: true,
      data: logs.map(serializeLog),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao carregar logs da consulta regulatoria.' });
  }
});

export default router;
