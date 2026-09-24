import { useState, useEffect, useCallback } from 'react';
import api from '../../api';

export default function InvestorInvites() {
  const [channel, setChannel] = useState('whatsapp');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const role = 'INVESTOR_VIEW';
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = channel === 'whatsapp' 
        ? { channel: 'whatsapp', phone, role, ...(name.trim() && { name: name.trim() }) }
        : { channel: 'email', email, role, ...(name.trim() && { name: name.trim() }) };

      const { data } = await api.post('/api/admin/investors/invite', payload);

      if (data.success) {
        setSuccess(data.message);
        setName('');
        setEmail('');
        setPhone('');
      } else {
        setError(data.error || 'Erro ao enviar convite');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao enviar convite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px' }}>
      <h1 style={{ color: '#d32f2f', marginBottom: '10px' }}>👥 Convites de Investidor</h1>
      <p style={{ color: '#666', marginBottom: '30px', fontSize: '14px' }}>
        Envie convites para investidores acessarem o sistema com permissões read-only.
      </p>

      {success && (
        <div style={{
          backgroundColor: '#e8f5e9',
          color: '#2e7d32',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #4caf50'
        }}>
          ✅ {success}
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#c62828',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #ef5350'
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 600, color: '#333' }}>
            Nome do Convidado
          </label>
          <input
            type="text"
            placeholder="Ex: Fernanda Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              opacity: loading ? 0.6 : 1
            }}
          />
          <small style={{ color: '#666', fontSize: '12px' }}>
            Opcional. Usado na saudação da mensagem.
          </small>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 600, color: '#333' }}>
            Canal de Envio
          </label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              opacity: loading ? 0.6 : 1
            }}
          >
            <option value="whatsapp">📱 WhatsApp</option>
            <option value="email">📧 Email</option>
          </select>
        </div>

        {channel === 'whatsapp' ? (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 600, color: '#333' }}>
              Telefone (formato E.164)
            </label>
            <input
              type="text"
              placeholder="+5521987654321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                opacity: loading ? 0.6 : 1
              }}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Formato E.164: +55 (Brasil) ou +1 (EUA) + código de área + número
            </small>
          </div>
        ) : (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 600, color: '#333' }}>
              Email do Investidor
            </label>
            <input
              type="email"
              placeholder="email.real@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                opacity: loading ? 0.6 : 1
              }}
            />
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 600, color: '#333' }}>
            Tipo de Acesso
          </label>
          <div
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: '#f7f7f7',
              color: '#333'
            }}
          >
            Investidor (Read-Only)
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: loading ? '#999' : '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '⏳ Enviando...' : channel === 'whatsapp' ? '📱 Enviar via WhatsApp' : '📧 Enviar via Email'}
        </button>
      </form>

      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '10px', color: '#333' }}>ℹ️ Como funciona:</h3>
        <ul style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', paddingLeft: '20px' }}>
          <li>O convidado receberá um link para definir senha</li>
          <li>Link expira em 2 horas</li>
          <li>Acesso read-only: pode visualizar mas não editar dados</li>
          <li>Login em: app.kaviar.com.br/admin/login</li>
          <li>WhatsApp: fallback automático para email se falhar</li>
        </ul>
      </div>

      <FollowupSection />
    </div>
  );
}

function FollowupSection() {
  const [eligible, setEligible] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/investors/followup-eligible');
      if (data.success) setEligible(data.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!eligible.length) return null;

  const send = async (id) => {
    setMsg('');
    setLoadingId(id);
    try {
      const { data } = await api.post(`/api/admin/investors/${id}/followup`);
      setMsg(data.success ? '✅ Follow-up enviado.' : `⚠️ ${data.error}`);
      load();
    } catch (err) {
      setMsg(`⚠️ ${err.response?.data?.error || 'Erro ao enviar.'}`);
    } finally {
      setLoadingId(null);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div style={{ marginTop: '30px' }}>
      <h2 style={{ fontSize: '16px', color: '#333', marginBottom: '15px' }}>📩 Follow-up Marketing</h2>
      <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
        Convidados que já acessaram o sistema. Envio único por pessoa, recomendado 24-48h após primeiro login.
      </p>
      {msg && <div style={{ padding: '10px', marginBottom: '15px', borderRadius: '4px', backgroundColor: msg.startsWith('✅') ? '#e8f5e9' : '#fff3e0', fontSize: '14px' }}>{msg}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: '8px' }}>Nome</th>
            <th style={{ padding: '8px' }}>Role</th>
            <th style={{ padding: '8px' }}>1º Login</th>
            <th style={{ padding: '8px' }}>Horas</th>
            <th style={{ padding: '8px' }}>Status</th>
            <th style={{ padding: '8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {eligible.map((e) => (
            <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px' }}>{e.name}</td>
              <td style={{ padding: '8px' }}>{e.role}</td>
              <td style={{ padding: '8px' }}>{fmt(e.firstLoginAt)}</td>
              <td style={{ padding: '8px' }}>{e.hourssinceLogin}h</td>
              <td style={{ padding: '8px' }}>
                {e.followupSentAt ? `✅ ${fmt(e.followupSentAt)}` : e.eligible ? '🟡 Elegível' : '⏳ < 24h'}
              </td>
              <td style={{ padding: '8px' }}>
                {!e.followupSentAt && (
                  <button
                    onClick={() => send(e.id)}
                    disabled={loadingId === e.id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: e.eligible ? '#1976d2' : '#bbb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: loadingId === e.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loadingId === e.id ? '⏳' : 'Enviar'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
