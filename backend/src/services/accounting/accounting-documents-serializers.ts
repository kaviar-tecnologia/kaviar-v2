import { computeTemporalStatus } from './accounting-documents.service';

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function serializeDocumentType(dt: any) {
  return {
    id: dt.id,
    code: dt.code,
    name: dt.name,
    description: dt.description ?? null,
    category: dt.category,
    requires_validity: dt.requires_validity,
    renewal_alert_days: dt.renewal_alert_days ?? null,
    sort_order: dt.sort_order,
    is_active: dt.is_active,
    created_at: toIso(dt.created_at),
    updated_at: toIso(dt.updated_at),
  };
}

export function serializeCompanyDocument(doc: any, renewalAlertDays?: number | null) {
  const alertDays = renewalAlertDays ?? doc.document_type?.renewal_alert_days ?? null;
  return {
    id: doc.id,
    legal_entity_id: doc.legal_entity_id,
    document_type_id: doc.document_type_id,
    status: doc.status,
    temporal_status: computeTemporalStatus(doc.expires_at, alertDays),
    issued_at: toIso(doc.issued_at),
    valid_from: toIso(doc.valid_from),
    expires_at: toIso(doc.expires_at),
    reference_number: doc.reference_number ?? null,
    notes: doc.notes ?? null,
    created_by_id: doc.created_by_id ?? null,
    created_by_type: doc.created_by_type ?? null,
    created_at: toIso(doc.created_at),
    updated_at: toIso(doc.updated_at),
    document_type: doc.document_type ? {
      code: doc.document_type.code,
      name: doc.document_type.name,
      category: doc.document_type.category,
    } : undefined,
    legal_entity: doc.legal_entity ? {
      id: doc.legal_entity.id,
      razao_social: doc.legal_entity.razao_social,
      cnpj: doc.legal_entity.cnpj,
    } : undefined,
    current_file: doc._currentFile ? serializeDocumentFile(doc._currentFile) : undefined,
    files_count: doc._count?.files ?? undefined,
  };
}

export function serializeDocumentFile(file: any) {
  return {
    id: file.id,
    version_number: file.version_number,
    original_filename: file.original_filename,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    scan_status: file.scan_status,
    replacement_reason: file.replacement_reason ?? null,
    created_at: toIso(file.created_at),
    // NEVER expose storage_key to frontend
  };
}

export function serializeUploadResponse(file: any, uploadUrl: string, expiresInSeconds: number) {
  return {
    file_id: file.id,
    version_number: file.version_number,
    upload_url: uploadUrl,
    expires_in_seconds: expiresInSeconds,
  };
}
