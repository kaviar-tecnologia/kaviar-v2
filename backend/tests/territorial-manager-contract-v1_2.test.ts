import { describe, expect, it } from 'vitest';
import {
  buildTerritorialManagerContractV12,
  buildTerritorySnapshotVersion,
  TERRITORIAL_MANAGER_CONTRACT_VERSION,
  type TerritorialManagerContractInput,
} from '../src/services/contracts/territorial-manager-contract-v1_2';

const baseInput: TerritorialManagerContractInput = {
  recipientType: 'individual',
  displayName: 'Gestor Teste',
  email: 'gestor@example.com',
  phone: '+55 21 99999-9999',
  address: 'Rua Teste, 123, Rio de Janeiro/RJ',
  cpf: '123.456.789-00',
  rg: '12.345.678-9',
  territory: {
    id: 'territory-123',
    name: 'Zona Teste',
    cityUf: 'Rio de Janeiro/RJ',
    version: 'sha256:test-version',
    neighborhoods: ['Bairro A', 'Bairro B'],
    assignmentId: 'assignment-123',
    assignmentStatus: 'pending_approval',
  },
  generatedAt: '2026-09-24T14:00:00.000Z',
};

function allText(input: TerritorialManagerContractInput = baseInput): string {
  const doc = buildTerritorialManagerContractV12(input);
  return doc.parts.flatMap(part => [
    part.title,
    part.subtitle || '',
    ...(part.metadata || []),
    ...part.sections.flatMap(section => [
      section.title,
      ...(section.paragraphs || []),
      ...(section.bullets || []),
    ]),
  ]).join('\n');
}

describe('territorial manager contract v1.2', () => {
  it('uses the canonical v1.2 version', () => {
    expect(TERRITORIAL_MANAGER_CONTRACT_VERSION).toBe('v1.2');
    expect(buildTerritorialManagerContractV12(baseInput).version).toBe('v1.2');
  });

  it('contains principal contract plus commercial, territorial and LGPD annexes', () => {
    const titles = buildTerritorialManagerContractV12(baseInput).parts.map(p => p.title);
    expect(titles).toEqual([
      'CONTRATO DE PARCERIA OPERACIONAL TERRITORIAL — PLATAFORMA KAVIAR',
      'ANEXO COMERCIAL I — PARTICIPAÇÃO TERRITORIAL',
      'ANEXO TERRITORIAL II — DELIMITAÇÃO E VERSÃO',
      'ANEXO LGPD III — TRATAMENTO DE DADOS PESSOAIS',
    ]);
  });

  it('does not create financial activation from generation or signature', () => {
    const text = allText();
    expect(text).toContain('NÃO É CRIADA POR ESTE DOCUMENTO');
    expect(text).toContain('Cadastro, assinatura, acesso ao painel, geração deste PDF');
    expect(text).not.toContain('Data de início:');
  });

  it('identifies territory id, version and neighborhoods in the territorial annex', () => {
    const text = allText();
    expect(text).toContain('Territory ID: territory-123');
    expect(text).toContain('Versão territorial: sha256:test-version');
    expect(text).toContain('Bairro A, Bairro B');
    expect(text).toContain('Manager Assignment ID: assignment-123');
    expect(text).toContain('Manager Assignment Status na geração: pending_approval');
  });

  it('builds deterministic territory snapshot versions', () => {
    const source = {
      id: 'territory-123',
      updated_at: new Date('2026-09-24T14:00:00.000Z'),
      neighborhoods: [
        { id: 'b', name: 'Bairro B', is_active: true, updated_at: new Date('2026-09-24T13:00:00.000Z') },
        { id: 'a', name: 'Bairro A', is_active: true, updated_at: new Date('2026-09-24T12:00:00.000Z') },
      ],
    };
    const reordered = { ...source, neighborhoods: [...source.neighborhoods].reverse() };
    const first = buildTerritorySnapshotVersion(source);
    const second = buildTerritorySnapshotVersion(reordered);
    expect(first).toBe(second);
    expect(first.startsWith('sha256:')).toBe(true);
    expect(first.length).toBe(71);
  });

  it('changes territory snapshot version when active status changes', () => {
    const active = {
      id: 'territory-123',
      updated_at: new Date('2026-09-24T14:00:00.000Z'),
      neighborhoods: [
        { id: 'a', name: 'Bairro A', is_active: true, updated_at: new Date('2026-09-24T12:00:00.000Z') },
      ],
    };
    const inactive = {
      ...active,
      neighborhoods: active.neighborhoods.map(n => ({ ...n, is_active: false })),
    };
    expect(buildTerritorySnapshotVersion(active)).not.toBe(buildTerritorySnapshotVersion(inactive));
  });

  it('changes territory snapshot version when composition changes', () => {
    const base = {
      id: 'territory-123',
      updated_at: new Date('2026-09-24T14:00:00.000Z'),
      neighborhoods: [
        { id: 'a', name: 'Bairro A', is_active: true, updated_at: new Date('2026-09-24T12:00:00.000Z') },
      ],
    };
    const changed = {
      ...base,
      neighborhoods: [
        ...base.neighborhoods,
        { id: 'b', name: 'Bairro B', is_active: true, updated_at: new Date('2026-09-24T13:00:00.000Z') },
      ],
    };
    expect(buildTerritorySnapshotVersion(base)).not.toBe(buildTerritorySnapshotVersion(changed));
  });

  it('mirrors the backend allocation rule using the origin neighborhood', () => {
    const text = allText();
    expect(text).toContain('origin_neighborhood_id');
    expect(text).toContain('bairro de origem');
  });

  it('keeps the approved economics: 40% manager and 0% in shadow area', () => {
    const text = allText();
    expect(text).toContain('40% (quarenta por cento)');
    expect(text).toContain('Área Reservada KAVIAR ou Área de Sombra geram 0% ao Gestor');
    expect(text).toContain('100% da Taxa da Plataforma Elegível permanece com a KAVIAR');
  });

  it('uses indefinite term with 30-day ordinary termination instead of fixed 12 months', () => {
    const text = allText();
    expect(text).toContain('prazo indeterminado');
    expect(text).toContain('aviso prévio escrito de 30 dias');
    expect(text).not.toContain('vigência de 12');
  });

  it('limits commercial prospecting to avoid representation powers', () => {
    const text = allText();
    expect(text).toContain('não exercerá mediação habitual de negócios mercantis');
    expect(text).toContain('não celebrará contratos em nome da KAVIAR');
    expect(text).toContain('não constitui comissão por negócio mercantil agenciado');
  });

  it('reinforces worker autonomy without schedules or mandatory hours', () => {
    const text = allText();
    expect(text).toContain('inexistindo jornada obrigatória, escala, salário fixo ou subordinação hierárquica');
    expect(text).toContain('não constituem controle de jornada');
  });

  it('requires LGPD incident notice to KAVIAR within 24 hours', () => {
    const text = allText();
    expect(text).toContain('em até 24 horas da ciência');
    expect(text).toContain('O Gestor atua como Operador');
  });

  it('includes anti-corruption and public-agent restrictions', () => {
    const text = allText();
    expect(text).toContain('vantagem indevida a agente público');
    expect(text).toContain('não representará a KAVIAR perante Prefeituras');
  });

  it('supports individual identification', () => {
    const lines = buildTerritorialManagerContractV12(baseInput).partyLines;
    expect(lines).toContain('Tipo: Pessoa Física');
    expect(lines).toContain('CPF: 123.456.789-00');
    expect(lines).toContain('RG: 12.345.678-9');
  });

  it('supports company identification with legal representative', () => {
    const companyInput: TerritorialManagerContractInput = {
      ...baseInput,
      recipientType: 'company',
      displayName: 'Gestora XPTO',
      cpf: null,
      rg: null,
      companyName: 'GESTORA XPTO LTDA',
      tradeName: 'Gestora XPTO',
      cnpj: '12.345.678/0001-99',
      legalRepresentativeName: 'Maria da Silva',
      legalRepresentativeCpf: '111.222.333-44',
    };
    const lines = buildTerritorialManagerContractV12(companyInput).partyLines;
    expect(lines).toContain('Tipo: Pessoa Jurídica');
    expect(lines).toContain('Razão social: GESTORA XPTO LTDA');
    expect(lines).toContain('CNPJ: 12.345.678/0001-99');
    expect(lines).toContain('Representante legal: Maria da Silva');
    expect(lines).toContain('CPF do representante: 111.222.333-44');
    expect(lines.some(l => l.startsWith('CPF: '))).toBe(false);
  });

  it('contains objective payment deadlines and legal-withholding distinction', () => {
    const text = allText();
    expect(text).toContain('até o 5º dia útil');
    expect(text).toContain('até o 15º dia útil');
    expect(text).toContain('Retenções tributárias ou previdenciárias');
    expect(text).toContain('Tributos próprios da KAVIAR não reduzem');
  });

  it('protects already-recognized amounts from retroactive shadow reclassification', () => {
    const text = allText();
    expect(text).toContain('não realizará reclassificação territorial com efeito retroativo');
    expect(text).toContain('não poderão retirar participação relativa a operações já reconhecidas');
  });
});
