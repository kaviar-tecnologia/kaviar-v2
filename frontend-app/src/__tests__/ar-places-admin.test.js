/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AR_PLACES_DASHBOARD_CARD, canAccessArPlaces } from '../pages/admin/arPlacesPermissions';

describe('AdminApp - seção KAVIAR AR e RBAC de rota', () => {
  const src = readFileSync(resolve(__dirname, '../components/admin/AdminApp.jsx'), 'utf8');
  const managerHomeSrc = readFileSync(resolve(__dirname, '../pages/admin/ManagerHome.jsx'), 'utf8');
  const operatorHomeSrc = readFileSync(resolve(__dirname, '../pages/admin/OperatorHome.jsx'), 'utf8');

  it('expõe seção KAVIAR AR com Locais AR', () => {
    expect(src).toContain("section: 'KAVIAR AR'");
    expect(src).toContain('AR_PLACES_DASHBOARD_CARD.title');
    expect(src).toContain('AR_PLACES_DASHBOARD_CARD.to');
  });

  it('rota /admin/ar-places permite SUPER_ADMIN, TERRITORIAL_MANAGER, TERRITORIAL_OPERATOR', () => {
    expect(src).toContain("path=\"/ar-places\"");
    expect(src).toContain("allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}");
  });

  it('rota /admin/ar-places não inclui FINANCE', () => {
    const routeSlice = src.slice(src.indexOf('path="/ar-places"'), src.indexOf('path="/ar-places"') + 220);
    expect(routeSlice).not.toContain('FINANCE');
  });

  it('menu KAVIAR AR respeita roles e oculta FINANCE', () => {
    expect(canAccessArPlaces('SUPER_ADMIN')).toBe(true);
    expect(canAccessArPlaces('TERRITORIAL_MANAGER')).toBe(true);
    expect(canAccessArPlaces('TERRITORIAL_OPERATOR')).toBe(true);
    expect(canAccessArPlaces('FINANCE')).toBe(false);
  });

  it('usa descrição neutra do card para todos os papéis permitidos', () => {
    expect(AR_PLACES_DASHBOARD_CARD).toMatchObject({
      title: 'KAVIAR AR — Locais',
      desc: 'Acessar locais AR de hotéis, comércios, turismo, CARE, Pet e aeroportos.',
      to: '/admin/ar-places',
    });
  });

  it('gestor e operador não renderizam AdminHome na raiz, então precisam do atalho em suas homes', () => {
    expect(src).toContain("if (admin?.role === 'TERRITORIAL_OPERATOR') return <OperatorHome />;");
    expect(src).toContain("if (admin?.role === 'TERRITORIAL_MANAGER') return <ManagerHome />;");
  });

  it('ManagerHome inclui o card de Locais AR para os roles permitidos', () => {
    expect(managerHomeSrc).toContain('canAccessArPlaces(admin?.role)');
    expect(managerHomeSrc).toContain('AR_PLACES_DASHBOARD_CARD.title');
    expect(managerHomeSrc).toContain('AR_PLACES_DASHBOARD_CARD.to');
  });

  it('OperatorHome inclui o card de Locais AR para os roles permitidos', () => {
    expect(operatorHomeSrc).toContain('canAccessArPlaces(admin?.role)');
    expect(operatorHomeSrc).toContain('AR_PLACES_DASHBOARD_CARD.title');
    expect(operatorHomeSrc).toContain('AR_PLACES_DASHBOARD_CARD.to');
  });
});

describe('ArPlacesPage - campos, filtros e conteúdo pt-BR', () => {
  const src = readFileSync(resolve(__dirname, '../pages/admin/ArPlacesPage.jsx'), 'utf8');

  it('possui filtros solicitados', () => {
    expect(src).toContain('label="Tipo"');
    expect(src).toContain('label="Status"');
    expect(src).toContain('label="Cidade"');
    expect(src).toContain('label="UF"');
    expect(src).toContain('label="Território"');
  });

  it('possui formulário com dados básicos obrigatórios', () => {
    expect(src).toContain('label="Nome"');
    expect(src).toContain('label="placeId"');
    expect(src).toContain('label="Latitude"');
    expect(src).toContain('label="Longitude"');
  });

  it('envia conteúdo em locale pt-BR', () => {
    expect(src).toContain("locale: 'pt-BR'");
    expect(src).toContain('label="Resumo"');
    expect(src).toContain('label="Descrição"');
    expect(src).toContain('label="Saiba mais"');
    expect(src).toContain('label="Informações úteis"');
    expect(src).toContain('label="Regras de fonte da IA"');
    expect(src).toContain('label="Limites da IA"');
  });

  it('operator fica sem ações de edição/criação', () => {
    expect(src).toContain('const isOperator = role === \'TERRITORIAL_OPERATOR\'');
    expect(src).toContain('{!isOperator && (');
  });

  it('permite vincular parceiro owner e revisar pendências no modal', () => {
    expect(src).toContain('label="Parceiro owner"');
    expect(src).toContain('Alteração pendente');
    expect(src).toContain('Comparativo simples');
    expect(src).toContain('Aprovar alteração');
    expect(src).toContain('Rejeitar alteração');
  });
});

describe('adminArPlacesService - contratos de API', () => {
  const src = readFileSync(resolve(__dirname, '../services/adminArPlacesService.js'), 'utf8');

  it('usa namespace /api/admin/ar/places', () => {
    expect(src).toContain("const BASE_PATH = '/api/admin/ar/places'");
  });

  it('expõe list/get/create/update e revisão pendente', () => {
    expect(src).toContain('export async function listArPlaces');
    expect(src).toContain('export async function getArPlaceById');
    expect(src).toContain('export async function createArPlace');
    expect(src).toContain('export async function updateArPlace');
    expect(src).toContain('export async function getArPlaceChangeRequest');
    expect(src).toContain('export async function approveArPlaceChangeRequest');
    expect(src).toContain('export async function rejectArPlaceChangeRequest');
  });
});
