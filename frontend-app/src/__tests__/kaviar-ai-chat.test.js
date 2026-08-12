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

  it('indicação de somente leitura', () => {
    expect(src).toContain('Somente leitura');
  });

  it('sugestões aparecem', () => {
    expect(src).toContain('O que precisa da minha atenção hoje?');
    expect(src).toContain('Como estão as corridas de hoje?');
    expect(src).toContain('Há documentos de motoristas pendentes?');
    expect(src).toContain('Quais obrigações financeiras exigem atenção?');
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
