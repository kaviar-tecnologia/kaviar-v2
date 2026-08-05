import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  LinearProgress, Alert, TextField, IconButton,
} from '@mui/material';
import { CloudUpload, Close, InsertDriveFile, CheckCircle } from '@mui/icons-material';
import accountantApi from '../../services/accountantApi';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.xlsx', '.xml'];
const EXTENSION_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
};

export default function DocumentUploadDialog({ open, onClose, documentId, onSuccess }) {
  const [file, setFile] = useState(null);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState('select'); // select, hashing, uploading, confirming, done, error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setReason('');
    setStep('select');
    setProgress(0);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate size
    if (selected.size > MAX_SIZE) {
      setError(`Arquivo excede o limite de 20MB (${(selected.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }

    // Validate extension
    const ext = '.' + selected.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Extensão "${ext}" não permitida. Permitidas: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }

    setError('');
    setFile(selected);
  };

  const computeSha256 = async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      // Step 1: Compute SHA-256
      setStep('hashing');
      setProgress(10);
      const sha256 = await computeSha256(file);

      // Step 2: Request presigned URL from backend
      setStep('uploading');
      setProgress(30);

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const mimeType = file.type || EXTENSION_MIME_MAP[ext] || 'application/octet-stream';

      const requestRes = await accountantApi.post('/api/accountant/portal/documents/upload', {
        document_id: documentId,
        filename: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        sha256,
        replacement_reason: reason || null,
      });

      const { file_id, upload_url } = requestRes.data?.data || {};
      if (!upload_url) throw new Error('Backend não retornou URL de upload');

      // Step 3: Upload directly to S3 via presigned PUT
      setProgress(50);
      const putResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(file.size),
        },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error(`Upload para S3 falhou: ${putResponse.status} ${putResponse.statusText}`);
      }

      // Step 4: Confirm upload with backend
      setStep('confirming');
      setProgress(80);
      await accountantApi.post('/api/accountant/portal/documents/upload/confirm', { file_id });

      // Done
      setStep('done');
      setProgress(100);

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setStep('error');
      setError(err.response?.data?.error || err.message || 'Erro no upload');
    }
  };

  const stepLabels = {
    select: 'Selecione o arquivo',
    hashing: 'Preparando arquivo...',
    uploading: 'Enviando arquivo...',
    confirming: 'Confirmando envio...',
    done: 'Arquivo enviado com sucesso.',
    error: 'Erro',
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: '#1E2433', border: '1px solid rgba(255,255,255,0.1)' } }}
    >
      <DialogTitle sx={{ color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Enviar Arquivo
        <IconButton onClick={handleClose} sx={{ color: 'rgba(255,255,255,0.4)' }}><Close /></IconButton>
      </DialogTitle>

      <DialogContent>
        {step === 'select' && (
          <>
            {/* Drop zone */}
            <Box
              sx={{
                border: '2px dashed rgba(212,175,55,0.3)',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { borderColor: '#D4AF37', bgcolor: 'rgba(212,175,55,0.05)' },
              }}
              onClick={() => document.getElementById('file-input-upload')?.click()}
            >
              <input
                id="file-input-upload"
                type="file"
                hidden
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFileSelect}
              />
              {file ? (
                <Box>
                  <InsertDriveFile sx={{ fontSize: 40, color: '#D4AF37', mb: 1 }} />
                  <Typography sx={{ color: '#fff', fontSize: 14 }}>{file.name}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {(file.size / 1024).toFixed(0)} KB • {file.type}
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <CloudUpload sx={{ fontSize: 40, color: 'rgba(255,255,255,0.2)', mb: 1 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                    Clique para selecionar ou arraste o arquivo
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, mt: 0.5 }}>
                    PDF, JPEG, PNG, DOCX, XLSX, XML • Máx 20MB
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Replacement reason */}
            <TextField
              label="Motivo da substituição (opcional)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
              sx={{ mt: 2, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' } }}
            />
          </>
        )}

        {(step === 'hashing' || step === 'uploading' || step === 'confirming') && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ color: '#fff', mb: 2, fontSize: 14 }}>{stepLabels[step]}</Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { bgcolor: '#D4AF37' } }}
            />
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, mt: 1 }}>
              {file?.name} • {(file?.size / 1024).toFixed(0)} KB
            </Typography>
          </Box>
        )}

        {step === 'done' && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 48, color: '#22C55E', mb: 1 }} />
            <Typography sx={{ color: '#22C55E', fontSize: 16, fontWeight: 600 }}>
              Arquivo enviado com sucesso.
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2, bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 'select' && (
          <>
            <Button onClick={handleClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              disabled={!file}
              onClick={handleUpload}
              startIcon={<CloudUpload />}
              sx={{ bgcolor: '#D4AF37', color: '#1A1F2E', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#B8960C' } }}
            >
              Enviar
            </Button>
          </>
        )}
        {step === 'error' && (
          <Button onClick={reset} sx={{ color: '#D4AF37', textTransform: 'none' }}>
            Tentar Novamente
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
