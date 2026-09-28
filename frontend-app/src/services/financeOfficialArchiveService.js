import api from '../api';

const BASE = '/api/admin/finance/monthly-close/evidence/official-archive';

const ERROR_MESSAGES = {
  OFFICIAL_ARCHIVE_DISABLED: 'O arquivo financeiro está indisponível nesta implantação.',
  OFFICIAL_ARCHIVE_PRIVATE_STORAGE_NOT_CONFIGURED: 'O cofre privado não está configurado. Contate o suporte.',
  SUPER_ADMIN_REQUIRED: 'A operação exige o perfil Superadministrador.',
  INVALID_OFFICIAL_ARCHIVE_INPUT: 'Revise a empresa, conta, provedor, competência e origem informados.',
  ARCHIVE_FILE_REQUIRED: 'Selecione um documento PDF ou CSV.',
  ARCHIVE_INVALID_SIZE: 'O arquivo precisa ter entre 6 bytes e 5 MB.',
  ARCHIVE_EXTENSION_NOT_ALLOWED: 'Somente arquivos PDF e CSV são aceitos.',
  ARCHIVE_INVALID_PDF: 'O conteúdo do PDF não foi reconhecido.',
  ARCHIVE_INVALID_CSV: 'O conteúdo CSV não foi reconhecido.',
  ARCHIVE_UTF8_REQUIRED: 'O CSV deve estar codificado em UTF-8.',
  ARCHIVE_MULTIPART_LIMIT: 'Limite do envio excedido: máximo de 5 MB e um arquivo.',
  ARCHIVE_MULTIPART_INVALID: 'Não foi possível interpretar o arquivo enviado.',
  DUPLICATE_ARCHIVE_HASH: 'Este documento já está registrado para a mesma conta, provedor e competência.',
  FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED: 'A conta precisa estar ativa e pertencer à empresa selecionada.',
  LEGAL_ENTITY_NOT_FOUND: 'Empresa não encontrada ou inativa.',
  ARCHIVE_NOT_FOUND: 'Registro de arquivo não encontrado.',
  ARCHIVE_SCAN_NOT_AVAILABLE: 'Este registro não está disponível para consulta ao GuardDuty.',
  ARCHIVE_SCAN_OR_READBACK_UNCONFIRMED: 'A análise ou integridade ainda não pôde ser confirmada. Consulte a situação antes de agir.',
  ARCHIVE_STORAGE_UNCONFIRMED: 'Não foi possível confirmar o armazenamento. Consulte as pendências antes de um novo envio.',
  ARCHIVE_RESERVATION_CONFLICT: 'O registro mudou durante o envio. Consulte as pendências.',
  ARCHIVE_SCAN_STATE_CONFLICT: 'O resultado foi atualizado por outra operação. Atualize a lista.',
  ARCHIVE_RECOVERY_PAGINATION_REQUIRED: 'Existem mais de 100 registros. Solicite revisão operacional, sem considerar o inventário completo.',
  ARCHIVE_UNEXPECTED_TRUST_STATE: 'Há um registro que exige revisão operacional.',
};

export const OFFICIAL_ARCHIVE_BASE = BASE;

export const officialArchiveErrorMessage = (error, fallback = 'Não foi possível concluir a operação.') => {
  const code = error?.response?.data?.error || error?.rawMessage || error?.message;
  if (error?.response?.status === 401 || error?.status === 401) return 'Sua sessão expirou. Faça login novamente.';
  if (error?.response?.status === 403 || error?.status === 403) return ERROR_MESSAGES.SUPER_ADMIN_REQUIRED;
  return ERROR_MESSAGES[code] || fallback;
};

const query = ({ legal_entity_id, year, month }) =>
  new URLSearchParams({
    legal_entity_id: String(legal_entity_id),
    year: String(year),
    month: String(month),
  }).toString();

export const listOfficialArchives = async (params) => {
  const response = await api.get(BASE + '?' + query(params), { timeout: 30000 });
  return response.data;
};

export const getOfficialArchiveRecovery = async (params) => {
  const response = await api.get(BASE + '/recovery?' + query(params), { timeout: 30000 });
  return response.data;
};

export const uploadOfficialArchive = async ({ file, legal_entity_id, account_id, provider, year, month, declared_source_channel }) => {
  const body = new FormData();
  body.append('legal_entity_id', legal_entity_id);
  body.append('account_id', account_id);
  body.append('provider', provider);
  body.append('year', String(year));
  body.append('month', String(month));
  body.append('declared_source_channel', declared_source_channel);
  body.append('file', file);
  const response = await api.post(BASE, body, {
    headers: { 'Content-Type': undefined },
    timeout: 45000,
  });
  return response.data;
};

export const checkOfficialArchiveMalware = async (id) => {
  const response = await api.post(BASE + '/' + encodeURIComponent(id) + '/check-malware', {}, { timeout: 45000 });
  return response.data;
};

export const isOfficialArchiveApproved = (item) =>
  item?.status === 'STORED_UNVERIFIED'
  && item?.malwareScanStatus === 'NO_THREATS_FOUND'
  && item?.malwareScanApproved === true
  && item?.storageIntegrityVerified === true;

export const officialArchiveStatus = (item) => {
  if (isOfficialArchiveApproved(item)) return { label: 'Sem ameaças · íntegro', tone: 'success' };
  const scan = item?.malwareScanStatus;
  if (scan === 'THREATS_FOUND') return { label: 'Ameaça detectada', tone: 'error' };
  if (scan === 'UNSUPPORTED' || scan === 'ACCESS_DENIED' || scan === 'FAILED')
    return { label: 'Análise bloqueada', tone: 'error' };
  if (item?.status === 'RESERVED') return { label: 'Reserva a revisar', tone: 'warning' };
  if (item?.status === 'STORED_UNVERIFIED') return { label: 'Histórico sem aval antivírus', tone: 'warning' };
  if (item?.status === 'STORED_PENDING_SCAN') return { label: 'Aguardando GuardDuty', tone: 'info' };
  return { label: 'Revisão necessária', tone: 'warning' };
};
