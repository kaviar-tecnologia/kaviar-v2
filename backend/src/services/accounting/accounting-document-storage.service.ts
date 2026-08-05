import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const BUCKET = process.env.S3_UPLOADS_BUCKET || 'kaviar-uploads-847895361928';
const REGION = process.env.AWS_REGION || 'us-east-2';

const PRESIGNED_PUT_EXPIRY = 300;  // 5 minutes for upload
const PRESIGNED_GET_EXPIRY = 300;  // 5 minutes for download

// Max 20MB per file
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Allowed MIME types
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/xml',
  'text/xml',
]);

// Allowed extensions (lowercase, with dot)
export const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.xlsx', '.xml',
]);

// Extension to MIME mapping for validation
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xml': ['application/xml', 'text/xml'],
};

const s3Client = new S3Client({ region: REGION });

/**
 * Generate a deterministic, collision-safe storage key.
 * Pattern: accounting-documents/{year}/{month}/{document_id}/{version}-{nonce}{ext}
 * UNIQUE constraint on storage_key prevents any collision at DB level.
 */
export function generateStorageKey(documentId: string, versionNumber: number, extension: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const nonce = crypto.randomBytes(8).toString('hex');
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `accounting-documents/${year}/${month}/${documentId}/v${versionNumber}-${nonce}${ext}`;
}

/**
 * Validate file metadata before generating presigned URL.
 */
export function validateFileMetadata(params: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): { valid: true } | { valid: false; error: string } {
  const { filename, mimeType, sizeBytes } = params;

  // Validate size
  if (sizeBytes <= 0) {
    return { valid: false, error: 'Tamanho do arquivo inválido' };
  }
  if (sizeBytes > MAX_FILE_SIZE) {
    return { valid: false, error: `Arquivo excede o limite de ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Extract and validate extension
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return { valid: false, error: 'Arquivo sem extensão' };
  }
  const extension = filename.slice(lastDot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { valid: false, error: `Extensão não permitida: ${extension}. Permitidas: ${[...ALLOWED_EXTENSIONS].join(', ')}` };
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, error: `Tipo MIME não permitido: ${mimeType}` };
  }

  // Cross-validate extension vs MIME
  const allowedMimesForExt = EXTENSION_MIME_MAP[extension];
  if (allowedMimesForExt && !allowedMimesForExt.includes(mimeType)) {
    return { valid: false, error: `Extensão ${extension} não corresponde ao tipo ${mimeType}` };
  }

  return { valid: true };
}

/**
 * Generate a presigned PUT URL for direct client upload to S3.
 * The client uploads directly to S3 using this URL.
 */
export async function generatePresignedPutUrl(params: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
  const { storageKey, mimeType, sizeBytes, sha256 } = params;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: sizeBytes,
    // ChecksumSHA256 would require the client to send base64-encoded sha256
    // Instead we verify after upload via HeadObject
    Metadata: {
      'x-kaviar-sha256': sha256,
      'x-kaviar-original-size': String(sizeBytes),
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_PUT_EXPIRY });
  return { uploadUrl, expiresInSeconds: PRESIGNED_PUT_EXPIRY };
}

/**
 * Generate a presigned GET URL for secure download.
 * Never expose storage_key or raw S3 URL to frontend.
 */
export async function generatePresignedGetUrl(params: {
  storageKey: string;
  originalFilename: string;
}): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
  const { storageKey, originalFilename } = params;

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalFilename)}"`,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_GET_EXPIRY });
  return { downloadUrl, expiresInSeconds: PRESIGNED_GET_EXPIRY };
}

/**
 * Verify uploaded file exists in S3 and check size matches.
 */
export async function verifyUpload(storageKey: string, expectedSize: number): Promise<{
  exists: boolean;
  actualSize?: number;
  sizeMatch?: boolean;
}> {
  try {
    const command = new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey });
    const response = await s3Client.send(command);
    const actualSize = response.ContentLength ?? 0;
    return { exists: true, actualSize, sizeMatch: actualSize === expectedSize };
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw err;
  }
}

/**
 * Extract file extension from filename (lowercase, with dot).
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}
