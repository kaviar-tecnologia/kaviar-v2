/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildPartnerArPlaceChangeRequestPayload } from '../pages/PartnerPortal';

describe('PartnerPortal - módulo KAVIAR AR', () => {
  const src = readFileSync(resolve(__dirname, '../pages/PartnerPortal.jsx'), 'utf8');

  it('expõe a tab KAVIAR AR e o módulo Meu Hotel', () => {
    expect(src).toContain('<Tab label="KAVIAR AR" />');
    expect(src).toContain('Meu Hotel');
    expect(src).toContain('Editar meu hotel');
  });

  it('mostra claramente quando existe alteração pendente', () => {
    expect(src).toContain('Alteração pendente');
    expect(src).toContain('A versão publicada continua ativa até revisão da KAVIAR.');
  });

  it('não expõe controles de grounding, boundary ou governança no portal parceiro', () => {
    expect(src).not.toContain('Regras de fonte da IA');
    expect(src).not.toContain('Limites da IA');
    expect(src).not.toContain('owner_partner_id');
    expect(src).not.toContain('grounding_rule');
    expect(src).not.toContain('boundary_rule');
  });
});

describe('buildPartnerArPlaceChangeRequestPayload', () => {
  it('envia somente campos permitidos do hotel parceiro', () => {
    const payload = buildPartnerArPlaceChangeRequestPayload({
      name: 'Hotel KAVIAR',
      address: 'Av. Atlântica, 100',
      summary: 'Resumo',
      description: 'Descrição',
      learn_more: 'Saiba mais',
      useful_info: 'Info útil',
      owner_partner_id: 'forbidden',
      status: 'APPROVED',
      place_id: 'hotel-kaviar',
      latitude: '-22.9',
    });

    expect(payload).toEqual({
      name: 'Hotel KAVIAR',
      address: 'Av. Atlântica, 100',
      summary: 'Resumo',
      description: 'Descrição',
      learn_more: 'Saiba mais',
      useful_info: 'Info útil',
    });
    expect(Object.keys(payload)).toEqual(['name', 'address', 'summary', 'description', 'learn_more', 'useful_info']);
  });
});
