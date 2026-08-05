import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  LinearProgress, Alert, TextField, IconButton,
} from '@mui/material';
import { CloudUpload, Close, InsertDriveFile, CheckCircle } from '@mui/icons-material';
import accountantApi from '../../services/accountantApi';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.xlsx', '.xml'];

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

  const handleUpload = async () => {
    if (!file) return;

    try {
      // Step 1: Prepare
      setStep('hashing');
      setProgress(20);

      // Step 2: Upload directly to backend via multipart form
      setStep('uploading');
      setProgress(40);

      const formData = new FormData();
      formData.append('file', file);
      if (reason) formData.append('replacement_reason', reason);

      const uploadRes = await accountantApi.post(
        `/api/accountant/portal/documents/upload?document_id=${documentId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }
      );

      if (!uploadRes.data?.success) {
        throw new Error(uploadRes.data?.error || 'Falha no envio');
      }

      // Done
      setStep('done');
      setProgress(100);

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setStep('error');
      setError(err.response?.data?.error || err.message || 'Erro no envio do arquivo');
    }
  };

  const stepLabels = {
    select: 'Selecione o arquivo',
    hashing: 'Preparando arquivo...',
    uploading: 'Enviando arquivo...',
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

        {(step === 'hashing' || step === 'uploading') && (
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
