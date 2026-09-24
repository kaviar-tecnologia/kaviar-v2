import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import {
  calculateMunicipalAuthorizationValidUntilFromApprovalInstant,
  evaluateMunicipalAuthorizationValidity,
  evaluateDriverRegulatoryCompatibility,
  getMunicipalRegulation,
  MUNICIPAL_MODALITIES,
  mapDriverModalityToMunicipalModality,
  MunicipalModality,
  selectCurrentMunicipalAuthorization,
} from '../services/municipal-regulation.service';

const router = Router();

const REGULATORY_CITY_STATUSES = [
  'NOT_STARTED',
  'CONTACTED',
  'WAITING_RESPONSE',
  'RESPONSE_RECEIVED',
  'DOCUMENTS_REQUESTED',
  'READY_TO_PROTOCOL',
  'PROTOCOL_SENT',
  'APPROVED',
  'REJECTED',
  'PAUSED',
] as const;

const CHECKLIST_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'NOT_APPLICABLE',
] as const;

const DRIVER_PROTOCOL_STATUSES = [
  'PREPARING',
  'READY_TO_SUBMIT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'NEEDS_COMPLEMENT',
] as const;

const MUNICIPAL_MODALITY_OPTIONS = [...MUNICIPAL_MODALITIES] as [MunicipalModality, ...MunicipalModality[]];

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(REGULATORY_CITY_STATUSES).optional(),
  state: z.string().trim().length(2).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

const createCaseSchema = z.object({
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().length(2),
  status: z.enum(REGULATORY_CITY_STATUSES),
  department_name: z.string().trim().max(255).optional().nullable(),
  contact_name: z.string().trim().max(255).optional().nullable(),
  contact_email: z.string().trim().email().max(255).optional().nullable(),
  contact_phone: z.string().trim().max(40).optional().nullable(),
  last_sent_at: z.coerce.date().optional().nullable(),
  last_response_at: z.coerce.date().optional().nullable(),
  next_follow_up_at: z.coerce.date().optional().nullable(),
  next_action: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
});

const updateCaseSchema = z.object({
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().length(2).optional(),
  status: z.enum(REGULATORY_CITY_STATUSES).optional(),
  department_name: z.string().trim().max(255).optional().nullable(),
  contact_name: z.string().trim().max(255).optional().nullable(),
  contact_email: z.string().trim().email().max(255).optional().nullable(),
  contact_phone: z.string().trim().max(40).optional().nullable(),
  last_sent_at: z.coerce.date().optional().nullable(),
  last_response_at: z.coerce.date().optional().nullable(),
  next_follow_up_at: z.coerce.date().optional().nullable(),
  next_action: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
});

const createChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  status: z.enum(CHECKLIST_STATUSES).optional(),
  required: z.coerce.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
  due_date: z.coerce.date().optional().nullable(),
});

const updateChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  status: z.enum(CHECKLIST_STATUSES).optional(),
  required: z.coerce.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
  due_date: z.coerce.date().optional().nullable(),
});

const cpfLast4Schema = z
  .string()
  .trim()
  .max(4, 'CPF final deve ter no máximo 4 dígitos.')
  .regex(/^\d{1,4}$/, 'CPF final deve conter apenas dígitos.')
  .optional()
  .nullable();

const createDriverProtocolSchema = z.object({
  driver_name: z.string().trim().min(1).max(255),
  cpf_last4: cpfLast4Schema,
  service_modality: z.enum(MUNICIPAL_MODALITY_OPTIONS).optional().nullable(),
  vehicle_plate: z.string().trim().max(16).optional().nullable(),
  vehicle_type: z.string().trim().max(60).optional().nullable(),
  protocol_number: z.string().trim().max(120).optional().nullable(),
  status: z.enum(DRIVER_PROTOCOL_STATUSES).optional(),
  next_action: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
  submitted_at: z.coerce.date().optional().nullable(),
  approved_at: z.coerce.date().optional().nullable(),
  rejected_at: z.coerce.date().optional().nullable(),
  next_follow_up_at: z.coerce.date().optional().nullable(),
});

const updateDriverProtocolSchema = z.object({
  driver_name: z.string().trim().min(1).max(255).optional(),
  cpf_last4: cpfLast4Schema,
  service_modality: z.enum(MUNICIPAL_MODALITY_OPTIONS).optional().nullable(),
  vehicle_plate: z.string().trim().max(16).optional().nullable(),
  vehicle_type: z.string().trim().max(60).optional().nullable(),
  protocol_number: z.string().trim().max(120).optional().nullable(),
  status: z.enum(DRIVER_PROTOCOL_STATUSES).optional(),
  next_action: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
  submitted_at: z.coerce.date().optional().nullable(),
  approved_at: z.coerce.date().optional().nullable(),
  rejected_at: z.coerce.date().optional().nullable(),
  next_follow_up_at: z.coerce.date().optional().nullable(),
});

const driverCandidatesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().min(1).max(32).optional(),
  modality: z.string().trim().min(1).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const createDriverProtocolFromDriverSchema = z.object({
  driverId: z.string().trim().min(1),
  serviceModality: z.enum(MUNICIPAL_MODALITY_OPTIONS).optional(),
  status: z.enum(DRIVER_PROTOCOL_STATUSES).optional(),
  nextAction: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

const TEST_CANDIDATE_TERMS = ['test', 'teste'] as const;
const OPERATIONAL_DRIVER_STATUSES = ['approved', 'active'] as const;

const SANTA_RITA_TRANSPORT_TEMPLATE = [
  {
    title: 'CNH categoria B ou superior com EAR',
    description: 'Confirmar habilitação compatível e observação de atividade remunerada.',
    category: 'Condutor',
    sort_order: 1,
  },
  {
    title: 'Certidão negativa de antecedentes criminais',
    description: 'Coletar documento vigente do condutor responsável.',
    category: 'Condutor',
    sort_order: 2,
  },
  {
    title: 'Comprovante de inscrição como contribuinte individual do INSS ou MEI',
    description: 'Validar enquadramento previdenciário ou empresarial do prestador.',
    category: 'Cadastro',
    sort_order: 3,
  },
  {
    title: 'Seguro APP e seguro obrigatório quando aplicável',
    description: 'Confirmar cobertura ativa para operação municipal.',
    category: 'Veículo',
    sort_order: 4,
  },
  {
    title: 'CRLV regular e licenciado do veículo',
    description: 'Exigir documento atualizado e sem pendências de licenciamento.',
    category: 'Veículo',
    sort_order: 5,
  },
  {
    title: 'Comprovante de residência',
    description: 'Validar endereço atualizado do condutor.',
    category: 'Condutor',
    sort_order: 6,
  },
  {
    title: 'Duas fotos 3x4',
    description: 'Separar imagens recentes para ficha municipal.',
    category: 'Cadastro',
    sort_order: 7,
  },
  {
    title: 'Inscrição no Cadastro de Receitas Mobiliárias do Município',
    description: 'Confirmar inscrição fiscal municipal ou etapa equivalente.',
    category: 'Município',
    sort_order: 8,
  },
  {
    title: 'Certidão negativa de débitos municipais',
    description: 'Checar eventuais restrições ou débitos com a prefeitura.',
    category: 'Município',
    sort_order: 9,
  },
  {
    title: 'Alvará municipal específico',
    description: 'Validar exigência e emissão do alvará aplicável.',
    category: 'Município',
    sort_order: 10,
  },
  {
    title: 'Verificação de idade máxima do veículo',
    description: 'Conferir limite de idade definido pelo município.',
    category: 'Veículo',
    sort_order: 11,
  },
  {
    title: 'Protocolo junto ao setor municipal responsável',
    description: 'Registrar o andamento formal do processo.',
    category: 'Protocolo',
    sort_order: 12,
  },
] as const;

function asNullable(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function buildSnippet(value: string | null | undefined, maxLength = 160): string | null {
  if (typeof value !== 'string') return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

function isChecklistDone(status: unknown): boolean {
  return status === 'DONE';
}

function normalizeCpfLast4(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveCpfLast4FromCpf(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.slice(-4);
}

function maskPhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

function buildModalitySummary(modalities: Array<{ modality: string; status: string }>): string | null {
  if (!modalities.length) return null;
  return modalities.map((item) => `${item.modality}:${item.status}`).join(' | ');
}

function normalizeServiceModality(value: unknown): MunicipalModality | null {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return (MUNICIPAL_MODALITIES as readonly string[]).includes(normalized)
    ? (normalized as MunicipalModality)
    : null;
}

function isMissingProtocolServiceModalityColumn(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2022') {
    return false;
  }

  const message = error.message || '';
  const columnMeta = typeof (error.meta as any)?.column === 'string' ? (error.meta as any).column : '';
  const causeMeta = typeof (error.meta as any)?.cause === 'string' ? (error.meta as any).cause : '';
  const details = `${message} ${columnMeta} ${causeMeta}`;

  return details.includes('municipal_regulatory_driver_protocols.service_modality')
    || (details.includes('municipal_regulatory_driver_protocols') && details.includes('service_modality'));
}

async function loadDriverProtocolsForCase(caseId: string) {
  const baseQuery = {
    where: { case_id: caseId },
    orderBy: [{ created_at: 'desc' as const }],
  };

  try {
    return await prisma.municipal_regulatory_driver_protocols.findMany({
      ...baseQuery,
      select: {
        id: true,
        case_id: true,
        driver_id: true,
        cycle_number: true,
        renewal_of_protocol_id: true,
        service_modality: true,
        driver_name: true,
        cpf_last4: true,
        vehicle_plate: true,
        vehicle_type: true,
        protocol_number: true,
        status: true,
        next_action: true,
        notes: true,
        submitted_at: true,
        approved_at: true,
        rejected_at: true,
        next_follow_up_at: true,
        created_at: true,
        updated_at: true,
      },
    });
  } catch (error) {
    if (!isMissingProtocolServiceModalityColumn(error)) {
      throw error;
    }

    const fallbackItems = await prisma.municipal_regulatory_driver_protocols.findMany({
      ...baseQuery,
      select: {
        id: true,
        case_id: true,
        driver_id: true,
        driver_name: true,
        cycle_number: true,
        renewal_of_protocol_id: true,
        cpf_last4: true,
        vehicle_plate: true,
        vehicle_type: true,
        protocol_number: true,
        status: true,
        next_action: true,
        notes: true,
        submitted_at: true,
        approved_at: true,
        rejected_at: true,
        next_follow_up_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    return fallbackItems.map((item) => ({
      ...item,
      cycle_number: item.cycle_number ?? 1,
      renewal_of_protocol_id: item.renewal_of_protocol_id ?? null,
      service_modality: null,
    }));
  }
}

function hasValidMunicipalAuthorization(authorization: {
  status: string;
  approved_by_admin_id: string | null;
  authorization_valid_until: Date | null;
}): boolean {
  const validity = evaluateMunicipalAuthorizationValidity({
    status: authorization.status,
    approved_by_admin_id: authorization.approved_by_admin_id,
    authorization_valid_until: authorization.authorization_valid_until,
  });

  return validity.isOperationallyValid;
}

type ProtocolCycleRecord = {
  id: string;
  case_id: string;
  driver_id: string | null;
  service_modality: MunicipalModality | null;
  cycle_number: number;
  renewal_of_protocol_id: string | null;
  status: string;
  protocol_number: string | null;
  driver_name: string;
  cpf_last4: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  next_action: string | null;
  notes: string | null;
  submitted_at: Date | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  next_follow_up_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type MunicipalAuthorizationRecord = {
  id: string;
  driver_id: string;
  service_modality: MunicipalModality;
  source_driver_protocol_id: string | null;
  status: string;
  approved_by_admin_id: string | null;
  authorization_valid_until: Date | null;
  created_at: Date;
};

type AuthorizationCycleCandidate = {
  id: string;
  source_driver_protocol_id: string | null;
  status: string;
  approved_by_admin_id: string | null;
  authorization_valid_until: Date | null;
  created_at: Date;
};

function buildCycleTupleKey(caseId: string, driverId: string, serviceModality: MunicipalModality) {
  return `${caseId}:${driverId}:${serviceModality}`;
}

function buildAuthorizationTupleKey(driverId: string, serviceModality: MunicipalModality) {
  return `${driverId}:${serviceModality}`;
}

function evaluateSelectedAuthorization(authorization: MunicipalAuthorizationRecord | null) {
  if (!authorization) return null;

  return evaluateMunicipalAuthorizationValidity({
    status: authorization.status,
    approved_by_admin_id: authorization.approved_by_admin_id,
    authorization_valid_until: authorization.authorization_valid_until,
  });
}

function authorizationBelongsToProtocolCycle(
  protocol: Pick<ProtocolCycleRecord, 'id' | 'cycle_number'>,
  authorization: { source_driver_protocol_id?: string | null },
): boolean {
  const sourceProtocolId = authorization.source_driver_protocol_id ?? null;

  if (sourceProtocolId === protocol.id) {
    return true;
  }

  if (Number(protocol.cycle_number || 1) === 1 && sourceProtocolId === null) {
    return true;
  }

  return false;
}

function resolveAuthorizationForProtocolCycle(
  protocol: Pick<ProtocolCycleRecord, 'id' | 'cycle_number'>,
  tupleAuthorizations: AuthorizationCycleCandidate[],
) {
  const matching = tupleAuthorizations.filter((authorization) => authorizationBelongsToProtocolCycle(protocol, authorization));
  return selectCurrentMunicipalAuthorization(matching);
}

function buildRenewalOperationalState(input: {
  protocol: ProtocolCycleRecord;
  isLatestCycle: boolean;
  protocolAuthorization: AuthorizationCycleCandidate | null;
  protocolValidity: ReturnType<typeof evaluateMunicipalAuthorizationValidity> | null;
  hasNextCycle: boolean;
}) {
  const { protocol, isLatestCycle, protocolAuthorization, protocolValidity, hasNextCycle } = input;

  if (!protocol.driver_id) {
    return { canStartRenewal: false, reason: 'Protocolo não está vinculado a um motorista real.' };
  }

  if (!protocol.service_modality) {
    return { canStartRenewal: false, reason: 'Defina a modalidade municipal para habilitar renovação.' };
  }

  if (!isLatestCycle) {
    return { canStartRenewal: false, reason: 'Somente o ciclo mais recente permite iniciar renovação.' };
  }

  if (hasNextCycle) {
    return { canStartRenewal: false, reason: 'Já existe um ciclo de renovação iniciado para este protocolo.' };
  }

  if (!protocolAuthorization || !protocolValidity) {
    return {
      canStartRenewal: false,
      reason: 'O ciclo regulatório atual ainda não possui uma autorização municipal concluída para renovação.',
    };
  }

  if (protocolValidity.state === 'ACTIVE') {
    return { canStartRenewal: false, reason: 'A autorização municipal ainda não está no período de renovação.' };
  }

  if (protocolValidity.state === 'INACTIVE') {
    return { canStartRenewal: false, reason: 'A autorização municipal exige revisão antes da renovação.' };
  }

  if (protocolValidity.state === 'EXPIRING_SOON' || protocolValidity.state === 'EXPIRED') {
    return { canStartRenewal: true, reason: null };
  }

  return { canStartRenewal: false, reason: 'A autorização municipal ainda não está no período de renovação.' };
}

type AuthorizationOperationalState = {
  state: 'NOT_GENERATED' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'REVIEW_REQUIRED';
  label:
    | 'Autorização ainda não gerada'
    | 'Autorização municipal ativa'
    | 'Autorização vence em breve'
    | 'Autorização municipal vencida'
    | 'Autorização exige revisão';
  canGenerate: boolean;
  reason: string | null;
  authorizationId: string | null;
  validUntil: Date | null;
  daysUntilExpiry: number | null;
};

function buildAuthorizationOperationalState(input: {
  driverId: string | null;
  protocolStatus: string;
  protocolNumber: string | null;
  serviceModality: MunicipalModality | null;
  hasActiveRegulation: boolean;
  isLatestCycle: boolean;
  authorization: {
    id: string;
    status: string;
    approved_by_admin_id: string | null;
    authorization_valid_until: Date | null;
  } | null;
}): AuthorizationOperationalState {
  if (!input.driverId) {
    return {
      state: 'REVIEW_REQUIRED',
      label: 'Autorização exige revisão',
      canGenerate: false,
      reason: 'Protocolo não está vinculado a um motorista real.',
      authorizationId: null,
      validUntil: null,
      daysUntilExpiry: null,
    };
  }

  if (input.authorization) {
    const validity = evaluateMunicipalAuthorizationValidity({
      status: input.authorization.status,
      approved_by_admin_id: input.authorization.approved_by_admin_id,
      authorization_valid_until: input.authorization.authorization_valid_until,
    });

    if (validity.state === 'ACTIVE') {
      return {
        state: 'ACTIVE',
        label: 'Autorização municipal ativa',
        canGenerate: false,
        reason: null,
        authorizationId: input.authorization.id,
        validUntil: validity.validUntil,
        daysUntilExpiry: validity.daysUntilExpiry,
      };
    }

    if (validity.state === 'EXPIRING_SOON') {
      return {
        state: 'EXPIRING_SOON',
        label: 'Autorização vence em breve',
        canGenerate: false,
        reason: null,
        authorizationId: input.authorization.id,
        validUntil: validity.validUntil,
        daysUntilExpiry: validity.daysUntilExpiry,
      };
    }

    if (validity.state === 'EXPIRED') {
      return {
        state: 'EXPIRED',
        label: 'Autorização municipal vencida',
        canGenerate: false,
        reason: 'Autorização municipal vencida. A renovação exige novo ciclo regulatório.',
        authorizationId: input.authorization.id,
        validUntil: validity.validUntil,
        daysUntilExpiry: validity.daysUntilExpiry,
      };
    }

    return {
      state: 'REVIEW_REQUIRED',
      label: 'Autorização exige revisão',
      canGenerate: false,
      reason: 'Já existe uma autorização municipal para esta modalidade e cidade.',
      authorizationId: input.authorization.id,
      validUntil: validity.validUntil,
      daysUntilExpiry: validity.daysUntilExpiry,
    };
  }

  if (input.protocolStatus !== 'APPROVED') {
    return {
      state: 'NOT_GENERATED',
      label: 'Autorização ainda não gerada',
      canGenerate: false,
      reason: 'A autorização só pode ser gerada para protocolo aprovado.',
      authorizationId: null,
      validUntil: null,
      daysUntilExpiry: null,
    };
  }

  if (!input.protocolNumber) {
    return {
      state: 'NOT_GENERATED',
      label: 'Autorização ainda não gerada',
      canGenerate: false,
      reason: 'Informe o número do protocolo municipal antes de gerar a autorização operacional.',
      authorizationId: null,
      validUntil: null,
      daysUntilExpiry: null,
    };
  }

  if (!input.isLatestCycle) {
    return {
      state: 'NOT_GENERATED',
      label: 'Autorização ainda não gerada',
      canGenerate: false,
      reason: 'Ciclo histórico não permite gerar nova autorização.',
      authorizationId: null,
      validUntil: null,
      daysUntilExpiry: null,
    };
  }

  if (!input.serviceModality) {
    return {
      state: 'NOT_GENERATED',
      label: 'Autorização ainda não gerada',
      canGenerate: false,
      reason: 'Defina a modalidade municipal no protocolo antes de gerar autorização.',
      authorizationId: null,
      validUntil: null,
      daysUntilExpiry: null,
    };
  }

  if (!input.hasActiveRegulation) {
    return {
      state: 'REVIEW_REQUIRED',
      label: 'Autorização exige revisão',
      canGenerate: false,
      reason: 'Não existe regra municipal ativa para cidade/UF/modalidade deste protocolo.',
      authorizationId: null,
      validUntil: null,
      daysUntilExpiry: null,
    };
  }

  return {
    state: 'NOT_GENERATED',
    label: 'Autorização ainda não gerada',
    canGenerate: true,
    reason: null,
    authorizationId: null,
    validUntil: null,
    daysUntilExpiry: null,
  };
}

router.use(authenticateAdmin, requireSuperAdmin);

// GET /api/admin/regulatory/cities
router.get('/regulatory/cities', async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.parse(req.query);

    const where: any = {};
    if (parsed.status) where.status = parsed.status;
    if (parsed.state) where.state = parsed.state.toUpperCase();
    if (parsed.city) where.city = { contains: parsed.city, mode: 'insensitive' };

    if (parsed.q) {
      where.OR = [
        { city: { contains: parsed.q, mode: 'insensitive' } },
        { state: { contains: parsed.q, mode: 'insensitive' } },
        { department_name: { contains: parsed.q, mode: 'insensitive' } },
        { contact_name: { contains: parsed.q, mode: 'insensitive' } },
        { contact_email: { contains: parsed.q, mode: 'insensitive' } },
        { notes: { contains: parsed.q, mode: 'insensitive' } },
        { next_action: { contains: parsed.q, mode: 'insensitive' } },
      ];
    }

    const skip = (parsed.page - 1) * parsed.limit;
    const [items, total] = await Promise.all([
      prisma.municipal_regulatory_cases.findMany({
        where,
        orderBy: [{ updated_at: 'desc' }, { city: 'asc' }],
        skip,
        take: parsed.limit,
      }),
      prisma.municipal_regulatory_cases.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / parsed.limit));

    return res.json({
      success: true,
      data: items,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Query inválida.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao listar casos regulatórios por cidade.' });
  }
});

// POST /api/admin/regulatory/cities
router.post('/regulatory/cities', async (req: Request, res: Response) => {
  try {
    const payload = createCaseSchema.parse(req.body);
    const adminId = (req as any).admin?.id || null;

    const created = await prisma.municipal_regulatory_cases.create({
      data: {
        city: payload.city,
        state: payload.state.toUpperCase(),
        status: payload.status,
        department_name: asNullable(payload.department_name),
        contact_name: asNullable(payload.contact_name),
        contact_email: asNullable(payload.contact_email),
        contact_phone: asNullable(payload.contact_phone),
        last_sent_at: payload.last_sent_at ?? null,
        last_response_at: payload.last_response_at ?? null,
        next_follow_up_at: payload.next_follow_up_at ?? null,
        next_action: asNullable(payload.next_action),
        notes: asNullable(payload.notes),
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      },
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao criar caso regulatório por cidade.' });
  }
});

// GET /api/admin/regulatory/cities/:id
router.get('/regulatory/cities/:id', async (req: Request, res: Response) => {
  try {
    const item = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    return res.json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao buscar caso regulatório por cidade.' });
  }
});

// GET /api/admin/regulatory/cities/:id/communications
router.get('/regulatory/cities/:id/communications', async (req: Request, res: Response) => {
  try {
    const item = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        city: true,
        state: true,
        contact_email: true,
      },
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const contactEmail = normalizeEmail(item.contact_email);
    if (!contactEmail) {
      return res.json({
        success: true,
        data: {
          city: item,
          contactEmail: null,
          sent: [],
          received: [],
        },
      });
    }

    const [sentLogs, receivedLogs] = await Promise.all([
      prisma.email_send_logs.findMany({
        where: {
          OR: [
            { to_email: { equals: contactEmail, mode: 'insensitive' } },
            { cc_email: { equals: contactEmail, mode: 'insensitive' } },
          ],
        },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true,
          subject: true,
          from_email: true,
          to_email: true,
          cc_email: true,
          status: true,
          created_at: true,
          provider_message_id: true,
          reply_to_inbound_email_id: true,
          attachment_count: true,
        },
      }),
      prisma.inbound_email_messages.findMany({
        where: {
          status: { notIn: ['TRASHED', 'DELETING'] },
          OR: [
            { from_email: { equals: contactEmail, mode: 'insensitive' } },
            { to_email: { equals: contactEmail, mode: 'insensitive' } },
          ],
        },
        orderBy: { received_at: 'desc' },
        take: 10,
        select: {
          id: true,
          subject: true,
          from_email: true,
          to_email: true,
          status: true,
          received_at: true,
          normalized_body: true,
          text_body: true,
          has_attachments: true,
          attachment_count: true,
          message_id: true,
          attachments: {
            where: { status: 'AVAILABLE' },
            orderBy: { created_at: 'asc' },
            select: {
              id: true,
              filename: true,
              content_type: true,
              size_bytes: true,
            },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        city: item,
        contactEmail,
        sent: sentLogs.map((log) => ({
          id: log.id,
          direction: 'sent',
          subject: log.subject,
          from: log.from_email,
          to: log.to_email,
          status: log.status,
          createdAt: log.created_at,
          sentAt: log.created_at,
          snippet: null,
          hasAttachments: (log.attachment_count || 0) > 0,
          originalId: log.id,
          providerMessageId: log.provider_message_id,
          replyToInboundEmailId: log.reply_to_inbound_email_id,
        })),
        received: receivedLogs.map((log) => ({
          id: log.id,
          direction: 'received',
          subject: log.subject || '(sem assunto)',
          from: log.from_email,
          to: log.to_email,
          status: log.status,
          receivedAt: log.received_at,
          createdAt: log.received_at,
          snippet: buildSnippet(log.normalized_body || log.text_body),
          hasAttachments: log.has_attachments || (log.attachment_count || 0) > 0,
          attachments: log.attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            contentType: attachment.content_type,
            sizeBytes: attachment.size_bytes,
          })),
          originalId: log.id,
          messageId: log.message_id,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao buscar comunicações vinculadas.' });
  }
});

// PATCH /api/admin/regulatory/cities/:id
router.patch('/regulatory/cities/:id', async (req: Request, res: Response) => {
  try {
    const payload = updateCaseSchema.parse(req.body);

    const existing = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const data: any = {
      updated_by_admin_id: (req as any).admin?.id || null,
    };

    if (payload.city !== undefined) data.city = payload.city;
    if (payload.state !== undefined) data.state = payload.state.toUpperCase();
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.department_name !== undefined) data.department_name = asNullable(payload.department_name);
    if (payload.contact_name !== undefined) data.contact_name = asNullable(payload.contact_name);
    if (payload.contact_email !== undefined) data.contact_email = asNullable(payload.contact_email);
    if (payload.contact_phone !== undefined) data.contact_phone = asNullable(payload.contact_phone);
    if (payload.last_sent_at !== undefined) data.last_sent_at = payload.last_sent_at;
    if (payload.last_response_at !== undefined) data.last_response_at = payload.last_response_at;
    if (payload.next_follow_up_at !== undefined) data.next_follow_up_at = payload.next_follow_up_at;
    if (payload.next_action !== undefined) data.next_action = asNullable(payload.next_action);
    if (payload.notes !== undefined) data.notes = asNullable(payload.notes);

    if (Object.keys(data).length === 1) {
      return res.status(400).json({ success: false, error: 'Nenhuma alteração enviada.' });
    }

    const updated = await prisma.municipal_regulatory_cases.update({
      where: { id: req.params.id },
      data,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao atualizar caso regulatório por cidade.' });
  }
});

// GET /api/admin/regulatory/cities/:id/checklist
router.get('/regulatory/cities/:id/checklist', async (req: Request, res: Response) => {
  try {
    const item = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        city: true,
        state: true,
      },
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const checklistItems = await prisma.municipal_regulatory_checklist_items.findMany({
      where: { case_id: item.id },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    return res.json({
      success: true,
      data: {
        city: item,
        items: checklistItems,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao buscar checklist municipal.' });
  }
});

// POST /api/admin/regulatory/cities/:id/checklist
router.post('/regulatory/cities/:id/checklist', async (req: Request, res: Response) => {
  try {
    const payload = createChecklistItemSchema.parse(req.body);
    const adminId = (req as any).admin?.id || null;

    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const created = await prisma.municipal_regulatory_checklist_items.create({
      data: {
        case_id: city.id,
        title: payload.title,
        description: asNullable(payload.description),
        category: asNullable(payload.category),
        status: payload.status || 'PENDING',
        required: payload.required ?? true,
        sort_order: payload.sort_order ?? 0,
        notes: asNullable(payload.notes),
        due_date: payload.due_date ?? null,
      },
    });

    return res.status(201).json({ success: true, data: created, meta: { created_by_admin_id: adminId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao criar item de checklist.' });
  }
});

// PATCH /api/admin/regulatory/cities/:id/checklist/:itemId
router.patch('/regulatory/cities/:id/checklist/:itemId', async (req: Request, res: Response) => {
  try {
    const payload = updateChecklistItemSchema.parse(req.body);

    const existing = await prisma.municipal_regulatory_checklist_items.findFirst({
      where: {
        id: req.params.itemId,
        case_id: req.params.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Item de checklist não encontrado.' });
    }

    const data: any = {};

    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = asNullable(payload.description);
    if (payload.category !== undefined) data.category = asNullable(payload.category);
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.required !== undefined) data.required = payload.required;
    if (payload.sort_order !== undefined) data.sort_order = payload.sort_order;
    if (payload.notes !== undefined) data.notes = asNullable(payload.notes);
    if (payload.due_date !== undefined) data.due_date = payload.due_date;

    const nextStatus = payload.status || existing.status;
    if (isChecklistDone(nextStatus)) {
      if (!existing.completed_at) {
        data.completed_at = new Date();
      }
    } else if (payload.status !== undefined) {
      data.completed_at = null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma alteração enviada.' });
    }

    const updated = await prisma.municipal_regulatory_checklist_items.update({
      where: { id: existing.id },
      data,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao atualizar item de checklist.' });
  }
});

// DELETE /api/admin/regulatory/cities/:id/checklist/:itemId
router.delete('/regulatory/cities/:id/checklist/:itemId', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.municipal_regulatory_checklist_items.findFirst({
      where: {
        id: req.params.itemId,
        case_id: req.params.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Item de checklist não encontrado.' });
    }

    await prisma.municipal_regulatory_checklist_items.delete({
      where: { id: existing.id },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao excluir item de checklist.' });
  }
});

// POST /api/admin/regulatory/cities/:id/checklist/template/app-transport
router.post('/regulatory/cities/:id/checklist/template/app-transport', async (req: Request, res: Response) => {
  try {
    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const existingCount = await prisma.municipal_regulatory_checklist_items.count({
      where: { case_id: city.id },
    });

    if (existingCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Checklist já possui itens cadastrados para esta cidade.',
      });
    }

    const created = await prisma.$transaction(
      SANTA_RITA_TRANSPORT_TEMPLATE.map((item) =>
        prisma.municipal_regulatory_checklist_items.create({
          data: {
            case_id: city.id,
            title: item.title,
            description: item.description,
            category: item.category,
            status: 'PENDING',
            required: true,
            sort_order: item.sort_order,
          },
        }),
      ),
    );

    return res.status(201).json({
      success: true,
      data: created,
      meta: {
        template: 'app-transport',
        created: created.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao aplicar modelo de checklist.' });
  }
});

// GET /api/admin/regulatory/cities/:id/driver-protocols
router.get('/regulatory/cities/:id/driver-protocols', async (req: Request, res: Response) => {
  try {
    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true, city: true, state: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const rawItems = await loadDriverProtocolsForCase(city.id);
    const protocolItems: ProtocolCycleRecord[] = rawItems.map((item) => ({
      id: item.id,
      case_id: item.case_id,
      driver_id: item.driver_id || null,
      service_modality: normalizeServiceModality(item.service_modality),
      cycle_number: Number(item.cycle_number || 1),
      renewal_of_protocol_id: item.renewal_of_protocol_id || null,
      driver_name: item.driver_name,
      cpf_last4: item.cpf_last4 || null,
      vehicle_plate: item.vehicle_plate || null,
      vehicle_type: item.vehicle_type || null,
      protocol_number: item.protocol_number || null,
      status: item.status,
      next_action: item.next_action || null,
      notes: item.notes || null,
      submitted_at: item.submitted_at || null,
      approved_at: item.approved_at || null,
      rejected_at: item.rejected_at || null,
      next_follow_up_at: item.next_follow_up_at || null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    const linkedDriverIds = Array.from(
      new Set(protocolItems.map((item) => item.driver_id).filter((driverId): driverId is string => Boolean(driverId))),
    );

    const modalitiesInProtocols = Array.from(
      new Set(protocolItems.map((item) => item.service_modality).filter((modality): modality is MunicipalModality => Boolean(modality))),
    );

    const regulations = modalitiesInProtocols.length > 0
      ? await prisma.municipal_regulations.findMany({
          where: {
            city: { equals: city.city, mode: 'insensitive' },
            state: { equals: city.state, mode: 'insensitive' },
            service_modality: { in: modalitiesInProtocols },
            is_active: true,
          },
          select: {
            id: true,
            service_modality: true,
          },
        })
      : [];

    const regulationByModality = new Map(
      regulations.map((regulation) => [regulation.service_modality as MunicipalModality, regulation.id]),
    );

    const authorizations: MunicipalAuthorizationRecord[] = linkedDriverIds.length > 0
      ? await prisma.municipal_authorizations.findMany({
          where: {
            driver_id: { in: linkedDriverIds },
            city: { equals: city.city, mode: 'insensitive' },
            state: { equals: city.state, mode: 'insensitive' },
          },
          orderBy: [{ created_at: 'desc' }],
          select: {
            id: true,
            driver_id: true,
            service_modality: true,
            source_driver_protocol_id: true,
            status: true,
            approved_by_admin_id: true,
            authorization_valid_until: true,
            created_at: true,
          },
        })
      : [];

    const authorizationsByTuple = new Map<string, MunicipalAuthorizationRecord[]>();

    for (const authorization of authorizations) {
      const tupleKey = buildAuthorizationTupleKey(authorization.driver_id, authorization.service_modality);
      const current = authorizationsByTuple.get(tupleKey) || [];
      current.push(authorization);
      authorizationsByTuple.set(tupleKey, current);

    }

    const latestCycleByTuple = new Map<string, ProtocolCycleRecord>();
    for (const protocol of protocolItems) {
      if (!protocol.driver_id || !protocol.service_modality) continue;

      const tupleKey = buildCycleTupleKey(protocol.case_id, protocol.driver_id, protocol.service_modality);
      const current = latestCycleByTuple.get(tupleKey);
      if (!current) {
        latestCycleByTuple.set(tupleKey, protocol);
        continue;
      }

      if (protocol.cycle_number > current.cycle_number) {
        latestCycleByTuple.set(tupleKey, protocol);
        continue;
      }

      if (protocol.cycle_number === current.cycle_number && protocol.created_at.getTime() > current.created_at.getTime()) {
        latestCycleByTuple.set(tupleKey, protocol);
      }
    }

    const nextCycleByParentProtocol = new Set(
      protocolItems
        .map((item) => item.renewal_of_protocol_id)
        .filter((value): value is string => Boolean(value)),
    );

    const items = protocolItems.map((item) => {
      const serviceModality = item.service_modality;
      const tupleKey = item.driver_id && serviceModality
        ? buildCycleTupleKey(item.case_id, item.driver_id, serviceModality)
        : null;
      const authTupleKey = item.driver_id && serviceModality
        ? buildAuthorizationTupleKey(item.driver_id, serviceModality)
        : null;
      const regulationId = serviceModality ? regulationByModality.get(serviceModality) || null : null;

      const latestCycle = tupleKey ? latestCycleByTuple.get(tupleKey) || null : null;
      const isLatestCycle = latestCycle ? latestCycle.id === item.id : true;

      const tupleAuthorizations = authTupleKey ? (authorizationsByTuple.get(authTupleKey) || []) : [];
      const selectedForProtocol = resolveAuthorizationForProtocolCycle(item, tupleAuthorizations);
      const protocolAuthorization = selectedForProtocol.selected;
      const protocolValidity = selectedForProtocol.validity;

      const renewalOperational = buildRenewalOperationalState({
        protocol: item,
        isLatestCycle,
        protocolAuthorization,
        protocolValidity,
        hasNextCycle: nextCycleByParentProtocol.has(item.id),
      });

      const authorizationOperational = buildAuthorizationOperationalState({
        driverId: item.driver_id || null,
        protocolStatus: item.status,
        protocolNumber: asNullable(item.protocol_number),
        serviceModality,
        hasActiveRegulation: Boolean(regulationId),
        isLatestCycle,
        authorization: protocolAuthorization,
      });

      return {
        ...item,
        linkedDriver: Boolean(item.driver_id),
        driverId: item.driver_id || null,
        service_modality: serviceModality,
        cycleNumber: item.cycle_number,
        isRenewal: item.cycle_number > 1 || Boolean(item.renewal_of_protocol_id),
        renewalOfProtocolId: item.renewal_of_protocol_id,
        isLatestCycle,
        renewalOperational,
        authorizationOperational,
        documentSummary: null,
      };
    });

    return res.json({
      success: true,
      data: {
        city,
        items,
      },
    });
  } catch (error) {
    console.error('[REGULATORY_DRIVER_PROTOCOLS_LIST_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao listar protocolos por motorista.' });
  }
});

// GET /api/admin/regulatory/cities/:id/driver-candidates
router.get('/regulatory/cities/:id/driver-candidates', async (req: Request, res: Response) => {
  try {
    const parsed = driverCandidatesQuerySchema.parse(req.query);
    const normalizedQuery = (parsed.q || '').trim();

    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true, city: true, state: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    if (normalizedQuery.length < 3) {
      return res.json({
        success: true,
        data: {
          city,
          items: [],
          meta: {
            minQueryLength: 3,
            queryRequired: true,
          },
        },
      });
    }

    const linked = await prisma.municipal_regulatory_driver_protocols.findMany({
      where: {
        case_id: city.id,
        driver_id: { not: null },
      },
      select: { driver_id: true },
    });

    const linkedIds = new Set(linked.map((item) => item.driver_id).filter(Boolean));

    const where: any = {
      deleted_at: null,
      OR: OPERATIONAL_DRIVER_STATUSES.map((status) => ({
        status: { equals: status, mode: 'insensitive' },
      })),
      AND: [
        {
          OR: [
            { driver_modalities: { none: {} } },
            {
              driver_modalities: {
                some: {
                  status: { equals: 'APPROVED', mode: 'insensitive' },
                },
              },
            },
          ],
        },
      ],
      NOT: {
        OR: TEST_CANDIDATE_TERMS.flatMap((term) => [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ]),
      },
    };

    if (parsed.status) {
      where.status = parsed.status;
    }

    if (parsed.modality) {
      where.driver_modalities = {
        some: {
          modality: { equals: parsed.modality, mode: 'insensitive' },
          status: { equals: 'APPROVED', mode: 'insensitive' },
        },
      };
    }

    where.AND.push({
      OR: [
        { name: { contains: normalizedQuery, mode: 'insensitive' } },
        { phone: { contains: normalizedQuery, mode: 'insensitive' } },
        { vehicle_plate: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    });

    const drivers = await prisma.drivers.findMany({
      where,
      orderBy: [{ updated_at: 'desc' }],
      take: parsed.limit,
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        document_cpf: true,
        vehicle_plate: true,
        vehicle_type: true,
        neighborhoods: {
          select: {
            city: true,
            territory: {
              select: {
                uf: true,
              },
            },
          },
        },
        driver_modalities: {
          select: {
            modality: true,
            status: true,
          },
          orderBy: [{ created_at: 'desc' }],
        },
      },
    });

    const driverIds = drivers.map((driver) => driver.id);

    const approvedModalitiesByDriver = new Map<string, MunicipalModality[]>();
    const allApprovedModalities = new Set<MunicipalModality>();

    for (const driver of drivers) {
      const approvedModalities = Array.from(
        new Set(
          driver.driver_modalities
            .filter((item) => String(item.status || '').trim().toUpperCase() === 'APPROVED')
            .map((item) => mapDriverModalityToMunicipalModality(item.modality))
            .filter((modality): modality is MunicipalModality => Boolean(modality)),
        ),
      );

      approvedModalitiesByDriver.set(driver.id, approvedModalities);
      for (const modality of approvedModalities) {
        allApprovedModalities.add(modality);
      }
    }

    const regulationsByModality = new Map<any, any>();
    if (allApprovedModalities.size > 0) {
      const regulations = await prisma.municipal_regulations.findMany({
        where: {
          city: { equals: city.city, mode: 'insensitive' },
          state: { equals: city.state, mode: 'insensitive' },
          service_modality: { in: Array.from(allApprovedModalities) },
          is_active: true,
        },
        include: {
          requirements: {
            orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
          },
        },
      });

      for (const regulation of regulations) {
        regulationsByModality.set(regulation.service_modality, regulation);
      }
    }

    for (const modality of allApprovedModalities) {
      if (!regulationsByModality.has(modality)) {
        regulationsByModality.set(modality, null);
      }
    }

    const requiredDocumentTypes = Array.from(
      new Set(
        Array.from(regulationsByModality.values())
          .filter(Boolean)
          .flatMap((regulation) => regulation.requirements || [])
          .filter((requirement) => requirement.is_required && Boolean(requirement.document_type))
          .map((requirement) => String(requirement.document_type).trim())
          .filter(Boolean),
      ),
    );

    const documentsByDriver = new Map<string, Array<{ type: string; status: string | null }>>();
    if (driverIds.length > 0 && requiredDocumentTypes.length > 0) {
      const docs = await prisma.driver_documents.findMany({
        where: {
          driver_id: { in: driverIds },
          type: { in: requiredDocumentTypes },
        },
        select: {
          driver_id: true,
          type: true,
          status: true,
        },
      });

      for (const document of docs) {
        const existing = documentsByDriver.get(document.driver_id) || [];
        existing.push({ type: document.type, status: document.status });
        documentsByDriver.set(document.driver_id, existing);
      }
    }

    const items: any[] = [];
    for (const driver of drivers) {
      const approvedModalities = approvedModalitiesByDriver.get(driver.id) || [];
      const compatibility = await evaluateDriverRegulatoryCompatibility(driver.id, city.city, city.state, {
        caseId: city.id,
        preloaded: {
          driverCity: driver.neighborhoods?.city || null,
          driverState: driver.neighborhoods?.territory?.uf || null,
          approvedModalities,
          regulationsByModality,
          driverDocuments: documentsByDriver.get(driver.id) || [],
          alreadyLinked: linkedIds.has(driver.id),
        },
      });

      items.push({
        id: driver.id,
        name: driver.name,
        cpfLast4: deriveCpfLast4FromCpf(driver.document_cpf),
        phoneMasked: maskPhone(driver.phone),
        vehiclePlate: driver.vehicle_plate || null,
        vehicleType: driver.vehicle_type || null,
        approvalStatus: driver.status,
        modalitySummary: buildModalitySummary(driver.driver_modalities),
        compatibility: {
          compatible: compatibility.compatible,
          status: compatibility.status,
          reasons: compatibility.reasons,
          cityMatch: compatibility.cityMatch,
          approvedModalities: compatibility.approvedModalities,
          compatibleModalities: compatibility.compatibleModalities,
        },
        documentSummary: compatibility.documentSummary,
        alreadyLinked: linkedIds.has(driver.id),
      });
    }

    return res.json({
      success: true,
      data: {
        city,
        items,
        meta: {},
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Query inválida.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao listar candidatos de motoristas.' });
  }
});

// POST /api/admin/regulatory/cities/:id/driver-protocols/from-driver
router.post('/regulatory/cities/:id/driver-protocols/from-driver', async (req: Request, res: Response) => {
  try {
    const payload = createDriverProtocolFromDriverSchema.parse(req.body);

    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true, city: true, state: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const driver = await prisma.drivers.findUnique({
      where: { id: payload.driverId },
      select: {
        id: true,
        name: true,
        document_cpf: true,
        vehicle_plate: true,
        vehicle_type: true,
        neighborhoods: {
          select: {
            city: true,
            territory: {
              select: {
                uf: true,
              },
            },
          },
        },
        driver_modalities: {
          select: {
            modality: true,
            status: true,
            vehicle_plate: true,
          },
          orderBy: [{ created_at: 'desc' }],
          take: 5,
        },
      },
    });

    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado.' });
    }

    const approvedModalities = Array.from(
      new Set(
        driver.driver_modalities
          .filter((item) => String(item.status || '').trim().toUpperCase() === 'APPROVED')
          .map((item) => mapDriverModalityToMunicipalModality(item.modality))
          .filter((modality): modality is MunicipalModality => Boolean(modality)),
      ),
    );

    const compatibility = await evaluateDriverRegulatoryCompatibility(driver.id, city.city, city.state, {
      caseId: city.id,
      preloaded: {
        driverCity: driver.neighborhoods?.city || null,
        driverState: driver.neighborhoods?.territory?.uf || null,
        approvedModalities,
      },
    });

    if (!compatibility.compatible) {
      const isReviewRequired = compatibility.status === 'REVIEW_REQUIRED';
      const code = isReviewRequired ? 'DRIVER_CITY_REVIEW_REQUIRED' : 'DRIVER_CITY_INCOMPATIBLE';
      const message = 'Motorista ainda não está compatível com esta cidade.';

      return res.status(isReviewRequired ? 422 : 409).json({
        success: false,
        error: message,
        code,
        compatibility: {
          status: compatibility.status,
          reasons: compatibility.reasons,
        },
      });
    }

    const compatibleModalities = compatibility.compatibleModalities || [];
    if (compatibleModalities.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Motorista ainda não possui modalidade municipal compatível para protocolo automático.',
        code: 'DRIVER_MODALITY_INCOMPATIBLE',
      });
    }

    let protocolServiceModality: MunicipalModality | null = null;
    if (compatibleModalities.length === 1) {
      protocolServiceModality = compatibleModalities[0];
    } else {
      if (!payload.serviceModality) {
        return res.status(422).json({
          success: false,
          error: 'Selecione a modalidade municipal para gerar o protocolo deste motorista.',
          code: 'DRIVER_MODALITY_SELECTION_REQUIRED',
          compatibleModalities,
        });
      }

      if (!compatibleModalities.includes(payload.serviceModality)) {
        return res.status(422).json({
          success: false,
          error: 'A modalidade selecionada não é compatível com este motorista nesta cidade.',
          code: 'DRIVER_MODALITY_INVALID',
          compatibleModalities,
        });
      }

      protocolServiceModality = payload.serviceModality;
    }

    const approvedModality = driver.driver_modalities.find((item) => item.status === 'APPROVED');
    const status = payload.status || 'PREPARING';
    let submittedAt: Date | null = null;
    let approvedAt: Date | null = null;
    let rejectedAt: Date | null = null;

    if (status === 'SUBMITTED') {
      submittedAt = new Date();
    }

    if (status === 'APPROVED') {
      approvedAt = new Date();
    }

    if (status === 'REJECTED') {
      rejectedAt = new Date();
    }

    const created = await prisma.municipal_regulatory_driver_protocols.create({
      data: {
        case_id: city.id,
        driver_id: driver.id,
        service_modality: protocolServiceModality,
        cycle_number: 1,
        renewal_of_protocol_id: null,
        driver_name: driver.name,
        cpf_last4: deriveCpfLast4FromCpf(driver.document_cpf),
        vehicle_plate: driver.vehicle_plate || approvedModality?.vehicle_plate || null,
        vehicle_type: driver.vehicle_type || null,
        status,
        next_action: asNullable(payload.nextAction) || 'Revisar documentos do motorista e preparar protocolo municipal.',
        notes: asNullable(payload.notes),
        submitted_at: submittedAt,
        approved_at: approvedAt,
        rejected_at: rejectedAt,
        next_follow_up_at: payload.nextFollowUpAt ?? null,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        ...created,
        linkedDriver: true,
        driverId: created.driver_id,
        compatibility: {
          compatible: compatibility.compatible,
          status: compatibility.status,
          reasons: compatibility.reasons,
          cityMatch: compatibility.cityMatch,
          approvedModalities: compatibility.approvedModalities,
          compatibleModalities: compatibility.compatibleModalities,
        },
        documentSummary: compatibility.documentSummary,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Este motorista já possui protocolo nesta cidade.' });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Não foi possível criar protocolo a partir do cadastro KAVIAR.' });
  }
});

// POST /api/admin/regulatory/cities/:id/driver-protocols/:protocolId/generate-authorization
router.post('/regulatory/cities/:id/driver-protocols/:protocolId/start-renewal', async (req: Request, res: Response) => {
  try {
    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true, city: true, state: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const protocol = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: {
        id: req.params.protocolId,
        case_id: city.id,
      },
    });

    if (!protocol) {
      return res.status(404).json({ success: false, error: 'Protocolo de motorista não encontrado.' });
    }

    if (!protocol.driver_id) {
      return res.status(409).json({
        success: false,
        error: 'Somente protocolos vinculados a motorista real podem iniciar renovação municipal.',
        code: 'PROTOCOL_DRIVER_REQUIRED',
      });
    }

    const serviceModality = normalizeServiceModality(protocol.service_modality);
    if (!serviceModality) {
      return res.status(409).json({
        success: false,
        error: 'Defina a modalidade municipal no protocolo antes de iniciar renovação.',
        code: 'PROTOCOL_MODALITY_REQUIRED',
      });
    }

    const driver = await prisma.drivers.findUnique({
      where: { id: protocol.driver_id },
      select: { id: true },
    });

    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista do protocolo não encontrado.' });
    }

    const latestProtocol = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: {
        case_id: city.id,
        driver_id: protocol.driver_id,
        service_modality: serviceModality,
      },
      orderBy: [{ cycle_number: 'desc' }, { created_at: 'desc' }],
    });

    if (!latestProtocol || latestProtocol.id !== protocol.id) {
      return res.status(409).json({
        success: false,
        error: 'Somente o ciclo mais recente pode iniciar renovação.',
        code: 'PROTOCOL_NOT_LATEST_CYCLE',
      });
    }

    const existingRenewal = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: { renewal_of_protocol_id: latestProtocol.id },
      orderBy: [{ created_at: 'desc' }],
    });

    if (existingRenewal) {
      return res.json({
        success: true,
        data: {
          protocolId: existingRenewal.id,
          cycleNumber: existingRenewal.cycle_number,
          idempotent: true,
        },
      });
    }

    const tupleAuthorizations = await prisma.municipal_authorizations.findMany({
      where: {
        driver_id: protocol.driver_id,
        city: { equals: city.city, mode: 'insensitive' },
        state: { equals: city.state, mode: 'insensitive' },
        service_modality: serviceModality,
      },
      orderBy: [{ created_at: 'desc' }],
      select: {
        id: true,
        source_driver_protocol_id: true,
        status: true,
        approved_by_admin_id: true,
        authorization_valid_until: true,
        created_at: true,
      },
    });

    const selectedForCycle = resolveAuthorizationForProtocolCycle(
      {
        id: latestProtocol.id,
        cycle_number: Number(latestProtocol.cycle_number || 1),
      },
      tupleAuthorizations,
    );
    const currentValidity = selectedForCycle.validity;

    if (!selectedForCycle.selected) {
      return res.status(409).json({
        success: false,
        error: 'O ciclo regulatório atual ainda não possui uma autorização municipal concluída para renovação.',
        code: 'MUNICIPAL_RENEWAL_CURRENT_CYCLE_NOT_AUTHORIZED',
      });
    }

    if (!currentValidity || currentValidity.state === 'INACTIVE') {
      return res.status(409).json({
        success: false,
        error: 'A autorização municipal atual exige revisão antes de iniciar renovação.',
        code: 'MUNICIPAL_RENEWAL_REVIEW_REQUIRED',
      });
    }

    if (currentValidity.state === 'ACTIVE') {
      return res.status(409).json({
        success: false,
        error: 'A autorização municipal ainda não está no período de renovação.',
        code: 'MUNICIPAL_RENEWAL_NOT_DUE',
      });
    }

    if (currentValidity.state !== 'EXPIRING_SOON' && currentValidity.state !== 'EXPIRED') {
      return res.status(409).json({
        success: false,
        error: 'A autorização municipal atual exige revisão antes de iniciar renovação.',
        code: 'MUNICIPAL_RENEWAL_REVIEW_REQUIRED',
      });
    }

    const nextCycle = Number(latestProtocol.cycle_number || 1) + 1;

    try {
      const created = await prisma.municipal_regulatory_driver_protocols.create({
        data: {
          case_id: latestProtocol.case_id,
          driver_id: latestProtocol.driver_id,
          service_modality: serviceModality,
          cycle_number: nextCycle,
          renewal_of_protocol_id: latestProtocol.id,
          driver_name: latestProtocol.driver_name,
          cpf_last4: latestProtocol.cpf_last4 || null,
          vehicle_plate: latestProtocol.vehicle_plate || null,
          vehicle_type: latestProtocol.vehicle_type || null,
          protocol_number: null,
          status: 'PREPARING',
          next_action: 'Organizar documentação e protocolar a renovação municipal.',
          notes: latestProtocol.notes || null,
          submitted_at: null,
          approved_at: null,
          rejected_at: null,
          next_follow_up_at: null,
        },
      });

      return res.status(201).json({
        success: true,
        data: {
          protocolId: created.id,
          cycleNumber: created.cycle_number,
          idempotent: false,
        },
      });
    } catch (error) {
      const isConcurrentDuplicate =
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        || (typeof error === 'object' && error !== null && (error as any).code === 'P2002');

      if (isConcurrentDuplicate) {
        const concurrent = await prisma.municipal_regulatory_driver_protocols.findFirst({
          where: { renewal_of_protocol_id: latestProtocol.id },
          orderBy: [{ created_at: 'desc' }],
        });

        if (concurrent) {
          return res.json({
            success: true,
            data: {
              protocolId: concurrent.id,
              cycleNumber: concurrent.cycle_number,
              idempotent: true,
            },
          });
        }
      }

      throw error;
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Não foi possível iniciar o ciclo de renovação municipal.' });
  }
});

router.post('/regulatory/cities/:id/driver-protocols/:protocolId/generate-authorization', async (req: Request, res: Response) => {
  try {
    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true, city: true, state: true, department_name: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const protocol = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: {
        id: req.params.protocolId,
        case_id: city.id,
      },
    });

    if (!protocol) {
      return res.status(404).json({ success: false, error: 'Protocolo de motorista não encontrado.' });
    }

    if (!protocol.driver_id) {
      return res.status(409).json({
        success: false,
        error: 'Somente protocolos vinculados a motorista real podem gerar autorização municipal.',
        code: 'PROTOCOL_DRIVER_REQUIRED',
      });
    }

    if (protocol.status !== 'APPROVED') {
      return res.status(409).json({
        success: false,
        error: 'A autorização municipal só pode ser gerada para protocolo aprovado.',
        code: 'PROTOCOL_NOT_APPROVED',
      });
    }

    const serviceModality = normalizeServiceModality(protocol.service_modality);
    if (!serviceModality) {
      return res.status(409).json({
        success: false,
        error: 'Defina a modalidade municipal no protocolo antes de gerar autorização.',
        code: 'PROTOCOL_MODALITY_REQUIRED',
      });
    }

    const latestProtocol = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: {
        case_id: city.id,
        driver_id: protocol.driver_id,
        service_modality: serviceModality,
      },
      orderBy: [{ cycle_number: 'desc' }, { created_at: 'desc' }],
      select: { id: true },
    });

    if (!latestProtocol || latestProtocol.id !== protocol.id) {
      return res.status(409).json({
        success: false,
        error: 'Somente o ciclo mais recente pode gerar autorização municipal.',
        code: 'PROTOCOL_NOT_LATEST_CYCLE',
      });
    }

    const isRenewal = Number(protocol.cycle_number || 1) > 1 || Boolean(protocol.renewal_of_protocol_id);

    const driver = await prisma.drivers.findUnique({
      where: { id: protocol.driver_id },
      select: { id: true },
    });

    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista do protocolo não encontrado.' });
    }

    const tupleAuthorizations = await prisma.municipal_authorizations.findMany({
      where: {
        driver_id: driver.id,
        city: { equals: city.city, mode: 'insensitive' },
        state: { equals: city.state, mode: 'insensitive' },
        service_modality: serviceModality,
      },
      orderBy: [{ created_at: 'desc' }],
      select: {
        id: true,
        status: true,
        approved_by_admin_id: true,
        authorization_valid_until: true,
        source_driver_protocol_id: true,
        created_at: true,
      },
    });

    const authorizationFromCurrentProtocol = tupleAuthorizations.find((item) => item.source_driver_protocol_id === protocol.id) || null;

    if (authorizationFromCurrentProtocol) {
      const existingValidity = evaluateMunicipalAuthorizationValidity({
        status: authorizationFromCurrentProtocol.status,
        approved_by_admin_id: authorizationFromCurrentProtocol.approved_by_admin_id,
        authorization_valid_until: authorizationFromCurrentProtocol.authorization_valid_until,
      });

      if (existingValidity.isOperationallyValid) {
        return res.json({
          success: true,
          data: {
            authorizationId: authorizationFromCurrentProtocol.id,
            idempotent: true,
            status: authorizationFromCurrentProtocol.status,
          },
          message: 'Autorização municipal já estava ativa para este protocolo.',
        });
      }

      return res.status(409).json({
        success: false,
        error: 'Já existe autorização municipal para este ciclo, mas ela exige revisão antes de nova geração.',
        code: 'AUTHORIZATION_ALREADY_EXISTS_REVIEW_REQUIRED',
      });
    }

    let previousAuthorizationForRenewal: {
      id: string;
      authorization_valid_until: Date | null;
      state: string;
    } | null = null;

    if (isRenewal) {
      const previousCycleProtocolId = protocol.renewal_of_protocol_id;

      if (!previousCycleProtocolId) {
        return res.status(409).json({
          success: false,
          error: 'O ciclo de renovação não está vinculado ao ciclo anterior autorizado.',
          code: 'MUNICIPAL_RENEWAL_PREVIOUS_CYCLE_REQUIRED',
        });
      }

      const previousCycleNumber = Math.max(Number(protocol.cycle_number || 1) - 1, 1);
      const selectedPreviousCycle = resolveAuthorizationForProtocolCycle(
        {
          id: previousCycleProtocolId,
          cycle_number: previousCycleNumber,
        },
        tupleAuthorizations,
      );
      const currentValidity = selectedPreviousCycle.validity;

      if (!selectedPreviousCycle.selected) {
        return res.status(409).json({
          success: false,
          error: 'O ciclo anterior ainda não possui autorização municipal válida para renovação.',
          code: 'MUNICIPAL_RENEWAL_CURRENT_CYCLE_NOT_AUTHORIZED',
        });
      }

      if (!currentValidity || currentValidity.state === 'INACTIVE') {
        return res.status(409).json({
          success: false,
          error: 'A autorização municipal atual exige revisão antes de gerar a renovação.',
          code: 'MUNICIPAL_RENEWAL_REVIEW_REQUIRED',
        });
      }

      previousAuthorizationForRenewal = {
        id: selectedPreviousCycle.selected.id,
        authorization_valid_until: selectedPreviousCycle.selected.authorization_valid_until,
        state: currentValidity.state,
      };

      if (currentValidity.state === 'ACTIVE') {
        return res.status(409).json({
          success: false,
          error: 'A autorização municipal ainda não está no período de renovação.',
          code: 'MUNICIPAL_RENEWAL_NOT_DUE',
        });
      }

      if (currentValidity.state !== 'EXPIRING_SOON' && currentValidity.state !== 'EXPIRED') {
        return res.status(409).json({
          success: false,
          error: 'A autorização municipal atual exige revisão antes de gerar a renovação.',
          code: 'MUNICIPAL_RENEWAL_REVIEW_REQUIRED',
        });
      }
    } else {
      const legacyAuthorizations = tupleAuthorizations.filter((item) => item.source_driver_protocol_id === null);
      const existingLegacy = selectCurrentMunicipalAuthorization(legacyAuthorizations).selected;

      if (existingLegacy) {
        const existingValidity = evaluateMunicipalAuthorizationValidity({
          status: existingLegacy.status,
          approved_by_admin_id: existingLegacy.approved_by_admin_id,
          authorization_valid_until: existingLegacy.authorization_valid_until,
        });

        if (existingValidity.isOperationallyValid) {
          return res.json({
            success: true,
            data: {
              authorizationId: existingLegacy.id,
              idempotent: true,
              status: existingLegacy.status,
            },
            message: 'Autorização municipal já estava ativa para este protocolo.',
          });
        }

        return res.status(409).json({
          success: false,
          error: 'Já existe autorização municipal para este motorista e modalidade. Revise o registro atual antes de gerar outra.',
          code: 'AUTHORIZATION_ALREADY_EXISTS_REVIEW_REQUIRED',
        });
      }
    }

    const protocolNumber = asNullable(protocol.protocol_number);
    if (!protocolNumber) {
      return res.status(409).json({
        success: false,
        error: 'Informe o número do protocolo municipal antes de gerar a autorização operacional.',
        code: 'PROTOCOL_NUMBER_REQUIRED',
      });
    }

    const regulation = await getMunicipalRegulation(city.city, city.state, serviceModality);
    if (!regulation) {
      return res.status(409).json({
        success: false,
        error: 'Não existe regra municipal ativa para cidade/UF/modalidade deste protocolo.',
        code: 'MUNICIPAL_REGULATION_NOT_FOUND',
      });
    }

    let authorizationValidUntil: Date | null = null;
    const configuredValidityMonths = regulation.authorization_validity_months;

    if (configuredValidityMonths !== null && configuredValidityMonths !== undefined) {
      if (configuredValidityMonths <= 0) {
        return res.status(409).json({
          success: false,
          error: 'A validade configurada para esta regra municipal precisa ser maior que zero.',
          code: 'MUNICIPAL_AUTHORIZATION_VALIDITY_INVALID',
        });
      }

      if (!protocol.approved_at) {
        return res.status(409).json({
          success: false,
          error: 'Informe a data de aprovação municipal do protocolo antes de gerar uma autorização com validade.',
          code: 'PROTOCOL_APPROVAL_DATE_REQUIRED_FOR_VALIDITY',
        });
      }

      authorizationValidUntil = calculateMunicipalAuthorizationValidUntilFromApprovalInstant(
        protocol.approved_at,
        configuredValidityMonths,
      );
    }

    const admin = (req as any).admin;
    let createdAuthorization: any;

    try {
      createdAuthorization = await prisma.municipal_authorizations.create({
        data: {
          driver_id: driver.id,
          regulation_id: regulation.id,
          source_driver_protocol_id: isRenewal ? protocol.id : null,
          city: city.city,
          state: city.state,
          service_modality: serviceModality,
          status: 'APPROVED_BY_CITY_HALL',
          protocol_number: protocolNumber,
          protocol_date: protocol.submitted_at || protocol.approved_at || null,
          protocol_agency: city.department_name || null,
          city_hall_notes: 'Autorização gerada a partir de protocolo aprovado no CRM regulatório por cidade.',
          submitted_by_admin_id: admin?.id || null,
          approved_by_admin_id: admin?.id || null,
          authorization_valid_until: authorizationValidUntil,
        },
        select: {
          id: true,
          status: true,
          approved_by_admin_id: true,
        },
      });
    } catch (error) {
      const isConcurrentDuplicate =
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        || (typeof error === 'object' && error !== null && (error as any).code === 'P2002');

      if (isConcurrentDuplicate) {
        const concurrentAuthorization = await prisma.municipal_authorizations.findFirst({
          where: isRenewal
            ? { source_driver_protocol_id: protocol.id }
            : {
                driver_id: driver.id,
                city: { equals: city.city, mode: 'insensitive' },
                state: { equals: city.state, mode: 'insensitive' },
                service_modality: serviceModality,
              },
          orderBy: [{ created_at: 'desc' }],
          select: {
            id: true,
            status: true,
            approved_by_admin_id: true,
            authorization_valid_until: true,
            source_driver_protocol_id: true,
          },
        });

        if (concurrentAuthorization && hasValidMunicipalAuthorization(concurrentAuthorization)) {
          return res.json({
            success: true,
            data: {
              authorizationId: concurrentAuthorization.id,
              idempotent: true,
              status: concurrentAuthorization.status,
            },
            message: isRenewal
              ? 'Autorização municipal de renovação já foi gerada por outra operação concorrente.'
              : 'Autorização municipal já foi gerada por outra operação concorrente.',
          });
        }

        if (concurrentAuthorization) {
          return res.status(409).json({
            success: false,
            error: 'A autorização municipal deste ciclo já existe, mas exige revisão antes de nova geração.',
            code: 'AUTHORIZATION_ALREADY_EXISTS_REVIEW_REQUIRED',
          });
        }
      }

      throw error;
    }

    await prisma.municipal_package_audit_logs.create({
      data: {
        driver_id: driver.id,
        authorization_id: createdAuthorization.id,
        action: 'STATUS_CHANGED',
        actor_admin_id: admin?.id || null,
        metadata: {
          source: isRenewal ? 'regulatory_renewal' : 'regulatory_city_protocol_approved',
          protocol_id: protocol.id,
          case_id: city.id,
          city: city.city,
          state: city.state,
          service_modality: serviceModality,
          cycleNumber: Number(protocol.cycle_number || 1),
          renewalOfProtocolId: protocol.renewal_of_protocol_id || null,
          previousAuthorizationId: previousAuthorizationForRenewal?.id || null,
          newAuthorizationId: createdAuthorization.id,
          previousValidUntil: previousAuthorizationForRenewal?.authorization_valid_until || null,
          newValidUntil: authorizationValidUntil,
          from_status: null,
          to_status: 'APPROVED_BY_CITY_HALL',
        },
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        authorizationId: createdAuthorization.id,
        idempotent: false,
        status: createdAuthorization.status,
        approvedByAdminId: createdAuthorization.approved_by_admin_id,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Não foi possível gerar autorização municipal a partir do protocolo aprovado.' });
  }
});

// POST /api/admin/regulatory/cities/:id/driver-protocols
router.post('/regulatory/cities/:id/driver-protocols', async (req: Request, res: Response) => {
  try {
    const payload = createDriverProtocolSchema.parse(req.body);

    const city = await prisma.municipal_regulatory_cases.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!city) {
      return res.status(404).json({ success: false, error: 'Caso regulatório não encontrado.' });
    }

    const status = payload.status || 'PREPARING';
    let submittedAt = payload.submitted_at ?? null;
    let approvedAt = payload.approved_at ?? null;
    let rejectedAt = payload.rejected_at ?? null;

    if (status === 'SUBMITTED' && !submittedAt) {
      submittedAt = new Date();
    }

    if (status === 'APPROVED') {
      if (!approvedAt) approvedAt = new Date();
      rejectedAt = null;
    }

    if (status === 'REJECTED') {
      if (!rejectedAt) rejectedAt = new Date();
      approvedAt = null;
    }

    if (status !== 'APPROVED' && status !== 'REJECTED') {
      approvedAt = null;
      rejectedAt = null;
    }

    const created = await prisma.municipal_regulatory_driver_protocols.create({
      data: {
        case_id: city.id,
        cycle_number: 1,
        renewal_of_protocol_id: null,
        service_modality: payload.service_modality || null,
        driver_name: payload.driver_name,
        cpf_last4: normalizeCpfLast4(payload.cpf_last4),
        vehicle_plate: asNullable(payload.vehicle_plate),
        vehicle_type: asNullable(payload.vehicle_type),
        protocol_number: asNullable(payload.protocol_number),
        status,
        next_action: asNullable(payload.next_action),
        notes: asNullable(payload.notes),
        submitted_at: submittedAt,
        approved_at: approvedAt,
        rejected_at: rejectedAt,
        next_follow_up_at: payload.next_follow_up_at ?? null,
      },
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao criar protocolo de motorista.' });
  }
});

// PATCH /api/admin/regulatory/cities/:id/driver-protocols/:protocolId
router.patch('/regulatory/cities/:id/driver-protocols/:protocolId', async (req: Request, res: Response) => {
  try {
    const payload = updateDriverProtocolSchema.parse(req.body);

    const existing = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: {
        id: req.params.protocolId,
        case_id: req.params.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Protocolo de motorista não encontrado.' });
    }

    const data: any = {};

    if (payload.driver_name !== undefined) data.driver_name = payload.driver_name;
    if (payload.cpf_last4 !== undefined) data.cpf_last4 = normalizeCpfLast4(payload.cpf_last4);
    if (payload.service_modality !== undefined) data.service_modality = payload.service_modality || null;
    if (payload.vehicle_plate !== undefined) data.vehicle_plate = asNullable(payload.vehicle_plate);
    if (payload.vehicle_type !== undefined) data.vehicle_type = asNullable(payload.vehicle_type);
    if (payload.protocol_number !== undefined) data.protocol_number = asNullable(payload.protocol_number);
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.next_action !== undefined) data.next_action = asNullable(payload.next_action);
    if (payload.notes !== undefined) data.notes = asNullable(payload.notes);
    if (payload.submitted_at !== undefined) data.submitted_at = payload.submitted_at;
    if (payload.approved_at !== undefined) data.approved_at = payload.approved_at;
    if (payload.rejected_at !== undefined) data.rejected_at = payload.rejected_at;
    if (payload.next_follow_up_at !== undefined) data.next_follow_up_at = payload.next_follow_up_at;

    const nextStatus = payload.status || existing.status;

    if (nextStatus === 'SUBMITTED' && data.submitted_at === undefined && !existing.submitted_at) {
      data.submitted_at = new Date();
    }

    if (nextStatus === 'APPROVED') {
      if (data.approved_at === undefined && !existing.approved_at) {
        data.approved_at = new Date();
      }
    } else if (payload.status !== undefined) {
      data.approved_at = null;
    }

    if (nextStatus === 'REJECTED') {
      if (data.rejected_at === undefined && !existing.rejected_at) {
        data.rejected_at = new Date();
      }
    } else if (payload.status !== undefined) {
      data.rejected_at = null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma alteração enviada.' });
    }

    const updated = await prisma.municipal_regulatory_driver_protocols.update({
      where: { id: existing.id },
      data,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    return res.status(500).json({ success: false, error: 'Erro ao atualizar protocolo de motorista.' });
  }
});

// DELETE /api/admin/regulatory/cities/:id/driver-protocols/:protocolId
router.delete('/regulatory/cities/:id/driver-protocols/:protocolId', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.municipal_regulatory_driver_protocols.findFirst({
      where: {
        id: req.params.protocolId,
        case_id: req.params.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Protocolo de motorista não encontrado.' });
    }

    await prisma.municipal_regulatory_driver_protocols.delete({
      where: { id: existing.id },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao excluir protocolo de motorista.' });
  }
});

export default router;
