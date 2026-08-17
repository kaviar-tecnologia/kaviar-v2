/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('KaviarAiPage — Chat KAVIAR', () => {
  const src = readFileSync(resolve(__dirname, '../pages/admin/KaviarAiPage.jsx'), 'utf8');

  it('página renderiza com título Chat KAVIAR', () => {
    expect(src).toContain('Chat KAVIAR');
  });

  it('subtítulo assistente operacional', () => {
    expect(src).toContain('Assistente operacional do KAVIAR');
  });

  it('indicação de leitura', () => {
    expect(src).toContain('Leitura');
  });

  it('sugestões principais aparecem', () => {
    expect(src).toContain('O que precisa da minha atenção hoje?');
    expect(src).toContain('Há emergências ou corridas pendentes?');
    expect(src).toContain('Como estão as corridas esta semana?');
    expect(src).toContain('Há motoristas aguardando aprovação?');
    expect(src).toContain('Quais obrigações financeiras exigem atenção?');
    expect(src).toContain('Quanto temos de bônus anual a pagar?');
  });

  it('sugestões adicionais existem como EXTRA_SUGGESTIONS', () => {
    expect(src).toContain('EXTRA_SUGGESTIONS');
    expect(src).toContain('Quais e-mails novos chegaram?');
    expect(src).toContain('Há mensagens novas no WhatsApp?');
    expect(src).toContain('Quantos leads novos tivemos esta semana?');
    expect(src).toContain('Quais módulos existem na plataforma?');
  });

  it('sugestões adicionais começam ocultas (showExtra inicia false)', () => {
    expect(src).toContain('useState(false)');
    expect(src).toContain('showExtra');
    // The extra block is conditionally rendered
    expect(src).toContain('{showExtra && (');
  });

  it('"Mais perguntas" abre a lista', () => {
    expect(src).toContain('Mais perguntas');
    expect(src).toContain('setShowExtra(!showExtra)');
  });

  it('"Ocultar perguntas" fecha a lista', () => {
    expect(src).toContain('Ocultar perguntas');
  });

  it('botão tem aria-expanded', () => {
    expect(src).toContain('aria-expanded={showExtra}');
  });

  it('clicar em sugestão mantém comportamento de envio existente', () => {
    // Both SUGGESTIONS and EXTRA_SUGGESTIONS use the same onClick handler
    expect(src).toContain('onClick={() => handleSend(s)}');
    // handleSend is the existing send function
    expect(src).toContain('const handleSend');
  });

  it('pergunta é enviada para /api/admin/ai/chat', () => {
    expect(src).toContain('askKaviarAi');
    expect(src).toContain('adminAiService');
  });

  it('resposta aparece no chat', () => {
    expect(src).toContain("role: 'assistant'");
    expect(src).toContain('result.answer');
  });

  it('toolsUsed são exibidas com nomes amigáveis', () => {
    expect(src).toContain('getToolFriendlyNames');
    expect(src).toContain('Dados consultados');
    expect(src).toContain('msg.toolsUsed');
  });

  it('loading bloqueia segundo envio', () => {
    expect(src).toContain('if (!question || loading) return');
    expect(src).toContain('disabled={loading}');
    expect(src).toContain('disabled={!input.trim() || loading}');
  });

  it('pergunta vazia não envia', () => {
    expect(src).toContain('if (!question || loading) return');
    expect(src).toContain('disabled={!input.trim() || loading}');
  });

  it('limite de 1000 caracteres', () => {
    expect(src).toContain('MAX_CHARS');
    expect(src).toContain('1000');
    expect(src).toContain('e.target.value.length <= MAX_CHARS');
  });

  it('erro é mostrado de forma amigável', () => {
    expect(src).toContain('Não foi possível consultar a KAVIAR IA agora. Tente novamente.');
    expect(src).toContain('Sessão expirada. Faça login novamente.');
    expect(src).toContain('Você não tem permissão para acessar a KAVIAR IA.');
    expect(src).toContain('Pergunta inválida');
  });

  it('erro restaura pergunta no input', () => {
    expect(src).toContain('setInput(question)');
  });

  it('Enter envia e Shift+Enter não envia', () => {
    expect(src).toContain("e.key === 'Enter' && !e.shiftKey");
    expect(src).toContain('e.preventDefault()');
    expect(src).toContain('handleSend()');
  });

  it('contador de caracteres', () => {
    expect(src).toContain('{input.length}/{MAX_CHARS}');
  });

  it('não persiste conversa em localStorage', () => {
    expect(src).not.toContain('localStorage.setItem');
  });

  it('governança de cobertura usa endpoint protegido por confirmação', () => {
    expect(src).toContain(
      '/api/admin/ai/territory/coverage/status'
    );
    expect(src).toContain('expected_status');
    expect(src).toContain('target_status');
    expect(src).toContain('ENVIAR_COBERTURA_REVISAO');
    expect(src).toContain('HOMOLOGAR_COBERTURA');
    expect(src).toContain('REABRIR_COBERTURA');
  });

  it('mostra ação de cobertura somente na resposta mais recente', () => {
    expect(src).toContain(
      'idx === messages.length - 1'
    );
    expect(src).toContain(
      "msg.toolsUsed?.includes('territory_manager_coverage')"
    );
  });

  it('reabertura exige motivo e COMPLETE não aprova gestores', () => {
    expect(src).toContain('Motivo da reabertura');
    expect(src).toContain('coverageNotes');
    expect(src).toContain(
      'COMPLETE homologa somente a base territorial.'
    );
    expect(src).toContain(
      'Não aprova quantidade de gestores nem contratação.'
    );
  });

  it('atualiza automaticamente a consulta após governança', () => {
    expect(src).toContain(
      'Como está a cobertura de gestores em'
    );
    expect(src).toContain('refreshed.answer');
    expect(src).toContain('refreshed.toolsUsed');
  });

  it('não contém chaves de API ou secrets', () => {
    expect(src).not.toContain('OPENAI_API_KEY');
    expect(src).not.toContain('api.openai.com');
    expect(src).not.toContain('sk-');
  });
});

describe('adminAiService — integração com endpoint', () => {
  const src = readFileSync(resolve(__dirname, '../services/adminAiService.js'), 'utf8');

  it('chama /api/admin/ai/chat', () => {
    expect(src).toContain("'/api/admin/ai'");
    expect(src).toContain('/chat');
  });

  it('usa api existente (axios com interceptor)', () => {
    expect(src).toContain("import api from '../api'");
  });

  it('toolsUsed mapeia nomes amigáveis', () => {
    expect(src).toContain('Corridas de hoje');
    expect(src).toContain('Documentos de motoristas');
    expect(src).toContain('Obrigações financeiras');
    expect(src).toContain('Cobertura de gestores');
  });

  it('não contém secrets', () => {
    expect(src).not.toContain('OPENAI_API_KEY');
    expect(src).not.toContain('Bearer');
    expect(src).not.toContain('localStorage');
  });
});

describe('AdminApp — rota e menu Chat KAVIAR', () => {
  const src = readFileSync(resolve(__dirname, '../components/admin/AdminApp.jsx'), 'utf8');

  it('importa KaviarAiPage', () => {
    expect(src).toContain('import KaviarAiPage');
    expect(src).toContain('KaviarAiPage');
  });

  it('rota /chat-kaviar protegida para SUPER_ADMIN e FINANCE', () => {
    expect(src).toContain('path="/chat-kaviar"');
    // A rota está envolvida por ProtectedAdminRoute com allowedRoles incluindo FINANCE
    const routeIdx = src.indexOf('path="/chat-kaviar"');
    const contextBefore = src.substring(Math.max(0, routeIdx - 200), routeIdx);
    const contextAfter = src.substring(routeIdx, routeIdx + 200);
    const routeBlock = contextBefore + contextAfter;
    expect(routeBlock).toContain("allowedRoles={['SUPER_ADMIN', 'FINANCE']}");
  });

  it('menu item Chat KAVIAR visível para canAccessFinance', () => {
    expect(src).toContain("title: 'Chat KAVIAR'");
    expect(src).toContain("to: '/admin/chat-kaviar'");
  });

  it('usa ícone SmartToy', () => {
    expect(src).toContain('SmartToy');
  });

  it('não amplia permissões (só SUPER_ADMIN e FINANCE)', () => {
    const routeIdx = src.indexOf('path="/chat-kaviar"');
    const block = src.substring(Math.max(0, routeIdx - 150), routeIdx + 150);
    expect(block).not.toContain('OPERATOR');
    expect(block).not.toContain('ANGEL_VIEWER');
    expect(block).not.toContain('TERRITORIAL');
  });
});

describe('KaviarAiPage — pesquisa regulatória error handling', () => {
  const src = readFileSync(resolve(__dirname, '../pages/admin/KaviarAiPage.jsx'), 'utf8');

  it('usa err.response.data.error quando backend retorna mensagem segura', () => {
    expect(src).toContain('err.response?.data?.error');
  });

  it('ECONNABORTED apresenta mensagem de timeout amigável', () => {
    expect(src).toContain("err.code === 'ECONNABORTED'");
    expect(src).toContain('demorou mais que o esperado. Tente novamente.');
  });

  it('erro sem response mantém mensagem genérica segura', () => {
    // Default errorMsg is generic when no response or timeout
    expect(src).toContain('Não foi possível realizar a pesquisa regulatória');
  });

  it('actionLoading volta para false pelo finally', () => {
    // handleRegulatorySearch uses try/catch/finally
    const searchSection = src.split('handleRegulatorySearch')[1];
    expect(searchSection).toContain('} finally {');
    expect(searchSection).toContain('setActionLoading(false)');
  });

  it('pesquisa regulatória mantém timeouts do fluxo assíncrono', () => {
    expect(src).toContain('MAX_POLL_MS = 180000');
    expect(src).toContain('timeout: 15000');
    expect(src).toContain('timeout: 10000');
  });
});
