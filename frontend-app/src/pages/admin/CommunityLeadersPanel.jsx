import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api';

const LEADER_TYPES = [
  { value: 'PRESIDENTE_ASSOCIACAO', label: 'Presidente de Associação' },
  { value: 'LIDER_RELIGIOSO', label: 'Líder Religioso' },
  { value: 'COMERCIANTE_LOCAL', label: 'Comerciante Local' },
  { value: 'AGENTE_SAUDE', label: 'Agente de Saúde' },
  { value: 'EDUCADOR', label: 'Educador' },
  { value: 'OUTRO', label: 'Outro' },
];

export default function CommunityLeadersPanel() {
  const [leaders, setLeaders] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    neighborhood_id: '',
    leader_type: '',
  });
  
  useEffect(() => {
    fetchNeighborhoods();
    fetchLeaders();
  }, []);
  
  useEffect(() => {
    if (selectedCity) {
      fetchLeaders();
    }
  }, [selectedCity]);
  
  const fetchNeighborhoods = async () => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      const response = await axios.get(`${API_BASE_URL}/api/neighborhoods`);
      setNeighborhoods(response.data?.data || []);
    } catch (err) {
      console.error('Error fetching neighborhoods:', err);
    }
  };
  
  const fetchLeaders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('kaviar_admin_token');
      const params = selectedCity ? { city: selectedCity } : {};
      const response = await axios.get(
        `${API_BASE_URL}/api/admin/community-leaders`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params
        }
      );
      setLeaders(response.data || []);
    } catch (err) {
      console.error('Error fetching leaders:', err);
      setError('Erro ao carregar líderes');
    } finally {
      setLoading(false);
    }
  };
  
  const handleOpenDialog = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      neighborhood_id: '',
      leader_type: '',
    });
    setOpenDialog(true);
  };
  
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError('');
  };
  
  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('kaviar_admin_token');
      await axios.post(
        `${API_BASE_URL}/api/admin/community-leaders`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuccess('Líder cadastrado com sucesso!');
      handleCloseDialog();
      fetchLeaders();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error creating leader:', err);
      setError(err.response?.data?.error || 'Erro ao cadastrar líder');
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerify = async (leaderId, status) => {
    try {
      const token = localStorage.getItem('kaviar_admin_token');
      await axios.patch(
        `${API_BASE_URL}/api/admin/community-leaders/${leaderId}/verify`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLeaders();
      setSuccess(`Líder ${status === 'VERIFIED' ? 'aprovado' : 'rejeitado'} com sucesso!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error verifying leader:', err);
      setError('Erro ao verificar líder');
    }
  };

  const cities = [...new Set(neighborhoods.map(n => n.city))];
  
  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5">Lideranças Comunitárias</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenDialog}
          >
            Cadastrar Líder
          </Button>
        </Box>
        
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Filtrar por Cidade</InputLabel>
          <Select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            label="Filtrar por Cidade"
          >
            <MenuItem value="">Todas as Cidades</MenuItem>
            {cities.map((city) => (
              <MenuItem key={city} value={city}>
                {city}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Bairro</TableCell>
                <TableCell>Cidade</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leaders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    {loading ? 'Carregando...' : 'Nenhum líder cadastrado'}
                  </TableCell>
                </TableRow>
              ) : (
                leaders.map((leader) => (
                  <TableRow key={leader.id}>
                    <TableCell>{leader.name}</TableCell>
                    <TableCell>{leader.email}</TableCell>
                    <TableCell>{leader.neighborhood?.name || '-'}</TableCell>
                    <TableCell>{leader.neighborhood?.city || '-'}</TableCell>
                    <TableCell>
                      {LEADER_TYPES.find(t => t.value === leader.leader_type)?.label || leader.leader_type}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          leader.verification_status === 'VERIFIED' ? 'Verificado' :
                          leader.verification_status === 'REJECTED' ? 'Rejeitado' :
                          'Pendente'
                        }
                        color={
                          leader.verification_status === 'VERIFIED' ? 'success' :
                          leader.verification_status === 'REJECTED' ? 'error' :
                          'warning'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {leader.verification_status === 'PENDING' && (
                        <>
                          <IconButton
                            onClick={() => handleVerify(leader.id, 'VERIFIED')}
                            color="success"
                            size="small"
                          >
                            <CheckIcon />
                          </IconButton>
                          <IconButton
                            onClick={() => handleVerify(leader.id, 'REJECTED')}
                            color="error"
                            size="small"
                          >
                            <CloseIcon />
                          </IconButton>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Cadastrar Líder Comunitário</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Nome Completo"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Telefone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth required>
              <InputLabel>Bairro</InputLabel>
              <Select
                value={formData.neighborhood_id}
                onChange={(e) => setFormData({ ...formData, neighborhood_id: e.target.value })}
                label="Bairro"
              >
                {neighborhoods.map((n) => (
                  <MenuItem key={n.id} value={n.id}>
                    {n.name} - {n.city}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel>Tipo de Liderança</InputLabel>
              <Select
                value={formData.leader_type}
                onChange={(e) => setFormData({ ...formData, leader_type: e.target.value })}
                label="Tipo de Liderança"
              >
                {LEADER_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading || !formData.name || !formData.email || !formData.leader_type}
          >
            Cadastrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
