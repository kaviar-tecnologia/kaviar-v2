import { COMPANY } from '../../config/company';

export const TERRITORIAL_MANAGER_CONTRACT_VERSION = 'v1.2' as const;

export type TerritorialManagerRecipientType = 'individual' | 'company' | 'association';

export interface TerritorialManagerContractInput {
  recipientType: TerritorialManagerRecipientType;
  displayName: string;
  email: string;
  phone: string;
  address: string;
  cpf?: string | null;
  rg?: string | null;
  companyName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  legalRepresentativeName?: string | null;
  legalRepresentativeCpf?: string | null;
  territory: {
    id: string;
    name: string;
    cityUf: string;
    version: string;
    neighborhoods: string[];
  };
  generatedAt: string;
}

export interface ContractSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface ContractPart {
  title: string;
  subtitle?: string;
  metadata?: string[];
  sections: ContractSection[];
}

export interface TerritorialManagerContractDocument {
  version: typeof TERRITORIAL_MANAGER_CONTRACT_VERSION;
  generatedAt: string;
  partyLines: string[];
  parts: ContractPart[];
}

function clean(value: string | null | undefined, fallback = '—'): string {
  const v = value?.trim();
  return v ? v : fallback;
}

function partyLines(input: TerritorialManagerContractInput): string[] {
  const common = [
    `E-mail: ${clean(input.email)}`,
    `Telefone: ${clean(input.phone)}`,
    `Endereço: ${clean(input.address)}`,
  ];

  if (input.recipientType === 'individual') {
    return [
      'Tipo: Pessoa Física',
      `Nome: ${clean(input.displayName)}`,
      `CPF: ${clean(input.cpf)}`,
      `RG: ${clean(input.rg)}`,
      ...common,
    ];
  }

  const label = input.recipientType === 'association' ? 'Associação' : 'Pessoa Jurídica';
  return [
    `Tipo: ${label}`,
    `Razão social: ${clean(input.companyName || input.displayName)}`,
    `Nome fantasia: ${clean(input.tradeName)}`,
    `CNPJ: ${clean(input.cnpj)}`,
    `Representante legal: ${clean(input.legalRepresentativeName)}`,
    `CPF do representante: ${clean(input.legalRepresentativeCpf)}`,
    ...common,
  ];
}

function neighborhoodsText(input: TerritorialManagerContractInput): string {
  return input.territory.neighborhoods.length
    ? input.territory.neighborhoods.join(', ')
    : 'Nenhum bairro nominal listado; prevalece o cadastro eletrônico vinculado ao territory_id acima.';
}

export function buildTerritorialManagerContractV12(
  input: TerritorialManagerContractInput,
): TerritorialManagerContractDocument {
  const party = partyLines(input);
  const territoryMetadata = [
    `Territory ID: ${input.territory.id}`,
    `Nome: ${input.territory.name}`,
    `Cidade/UF: ${input.territory.cityUf}`,
    `Versão territorial: ${input.territory.version}`,
    `Bairros/comunidades vinculados nesta versão: ${neighborhoodsText(input)}`,
    'Ativação Financeira: NÃO É CRIADA POR ESTE DOCUMENTO. Depende de registro específico e válido nos sistemas da KAVIAR.',
  ];

  const principal: ContractPart = {
    title: 'CONTRATO DE PARCERIA OPERACIONAL TERRITORIAL — PLATAFORMA KAVIAR',
    subtitle: `Versão contratual ${TERRITORIAL_MANAGER_CONTRACT_VERSION}`,
    metadata: [
      `KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA — CNPJ ${COMPANY.cnpj}`,
      COMPANY.legalAddress,
      `${COMPANY.email} | ${COMPANY.website}`,
      ...party,
    ],
    sections: [
      {
        title: '1. DEFINIÇÕES',
        paragraphs: [
          'KAVIAR: KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA, proprietária e operadora da Plataforma KAVIAR.',
          'Plataforma KAVIAR: conjunto de aplicativos, painéis, sistemas e serviços tecnológicos utilizados na operação da KAVIAR.',
          'Gestor Territorial: parceiro autônomo vinculado a Território Operacional Atribuído específico, responsável por atividades locais de captação, acompanhamento e apoio operacional nos limites deste Contrato.',
          'Território Operacional Atribuído: área geográfica formalmente vinculada ao Gestor, identificada por territory_id, cadastro eletrônico e Anexo Territorial vigente. A indicação de cidade, município, zona ou bairro ampliado não implica atribuição automática de toda a respectiva área.',
          'Área Reservada KAVIAR ou Área de Sombra: área não incluída no Território Operacional Atribuído ou expressamente reservada à operação direta da KAVIAR, expansão futura, ponto estratégico ou outro arranjo operacional. Operações reconhecidas nessas áreas não geram participação econômica ao Gestor.',
          'Ativação Financeira: condição registrada nos sistemas da KAVIAR que habilita participação econômica. Cadastro, assinatura, acesso ao painel, geração deste PDF ou preparação do território, isoladamente, não constituem Ativação Financeira.',
          'Taxa da Plataforma Elegível: taxa operacional da KAVIAR efetivamente reconhecida em Operação Elegível, conforme política de preços vigente, antes dos custos internos da KAVIAR e observadas as exclusões deste Contrato.',
          'Operação Elegível: operação que satisfaça cumulativamente os requisitos previstos na Cláusula 9.',
        ],
      },
      {
        title: '2. OBJETO E DELIMITAÇÃO TERRITORIAL',
        paragraphs: [
          `A KAVIAR estabelece parceria operacional territorial autônoma com o Gestor para acompanhamento, captação e suporte local exclusivamente no Território Operacional Atribuído identificado no Anexo Territorial II, territory_id ${input.territory.id}.`,
          'Somente a área formalmente registrada na versão territorial vigente integra o território remunerado do Gestor.',
          'Áreas Reservadas KAVIAR, ainda que localizadas na mesma cidade, município, região administrativa ou bairro ampliado, não integram o território remunerado.',
          'O vínculo territorial não transfere propriedade, direito real, licença territorial permanente, compra de território ou exclusividade absoluta.',
          'Alterações territoriais terão efeito prospectivo, serão auditáveis e não poderão retirar participação relativa a operações já reconhecidas segundo a versão vigente no respectivo fato gerador.',
          'Redução material de território anteriormente atribuído será comunicada com antecedência mínima de 30 dias, salvo acordo entre as partes ou necessidade imediata decorrente de lei, regulação, segurança, fraude ou risco operacional relevante. O Gestor poderá rescindir sem penalidade caso não concorde com a redução prospectiva.',
        ],
      },
      {
        title: '3. NATUREZA DA RELAÇÃO E AUTONOMIA',
        paragraphs: [
          'A relação é estruturada como parceria civil/empresarial operacional autônoma e não como oferta de franquia. A qualificação jurídica depende da execução prática e deverá ser revista se houver mudança material do modelo.',
          'O presente instrumento não cria sociedade, associação societária, mandato, agência, representação comercial, relação empregatícia, cessão de estabelecimento ou franquia por mera denominação.',
          'O Gestor organiza livremente seus horários, métodos e recursos, inexistindo jornada obrigatória, escala, salário fixo ou subordinação hierárquica típica de relação de emprego.',
          'Metas ou indicadores eventualmente disponibilizados pela KAVIAR têm natureza comercial e operacional e não constituem controle de jornada ou poder disciplinar trabalhista.',
          'O Gestor permanece responsável por suas próprias obrigações fiscais, tributárias, previdenciárias, trabalhistas e empresariais, sem prejuízo de retenções legais atribuídas à KAVIAR como fonte pagadora.',
        ],
      },
      {
        title: '4. RESPONSABILIDADES DO GESTOR TERRITORIAL',
        bullets: [
          'Captar motoristas, passageiros potenciais, parceiros e associações dentro do território atribuído, respeitados os limites deste Contrato.',
          'Acompanhar métricas e informações disponibilizadas pela Plataforma KAVIAR.',
          'Apoiar questões operacionais locais sem assumir obrigações em nome da KAVIAR.',
          'Reportar problemas, sugestões, incidentes e demandas locais.',
          'Atuar somente dentro do escopo territorial autorizado, salvo autorização expressa.',
          'Manter sigilo sobre informações não públicas e cumprir o Anexo LGPD.',
          'Respeitar diretrizes de marca, comunicação, segurança e conformidade.',
          'Não prometer aprovação de cadastros, ganhos, repasses, preços, exclusividade ou condições não autorizadas.',
        ],
      },
      {
        title: '5. PROSPECÇÃO COMERCIAL E AUSÊNCIA DE REPRESENTAÇÃO',
        paragraphs: [
          'O Gestor poderá identificar potenciais parceiros e encaminhar contatos à KAVIAR, mas não exercerá mediação habitual de negócios mercantis em nome da KAVIAR.',
          'O Gestor não receberá pedidos em nome da KAVIAR, não formulará ou negociará propostas comerciais vinculantes, não fixará preços, não concederá descontos e não celebrará contratos em nome da KAVIAR sem procuração específica e expressa.',
          'Preços, propostas, aprovações e contratações serão realizados exclusivamente pela KAVIAR ou por pessoa formalmente autorizada.',
          'A participação territorial prevista neste instrumento não constitui comissão por negócio mercantil agenciado pelo Gestor.',
        ],
      },
      {
        title: '6. RESPONSABILIDADES DA KAVIAR',
        bullets: [
          'Disponibilizar as ferramentas aplicáveis ao acompanhamento territorial.',
          'Disponibilizar métricas e relatórios compatíveis com o perfil de acesso.',
          'Definir e comunicar regras operacionais, comerciais e financeiras.',
          'Processar apuração e repasses conforme este Contrato e seus anexos.',
          'Manter registro auditável da delimitação territorial aplicável.',
          'Informar alterações materiais na forma prevista neste instrumento.',
        ],
      },
      {
        title: '7. MARCA E PROPRIEDADE INTELECTUAL',
        paragraphs: [
          'A marca, sistemas, software, banco de dados, documentação e demais ativos intelectuais da Plataforma KAVIAR permanecem de propriedade ou uso legítimo exclusivo da KAVIAR.',
          'A autorização de uso da marca pelo Gestor é limitada, pessoal, revogável, não exclusiva, intransferível e não sublicenciável, exclusivamente durante a vigência e para atividades autorizadas.',
          'É vedado registrar domínio, perfil, marca, canal ou material que possa ser confundido com canal oficial da KAVIAR.',
          'Encerrado o Contrato, o uso da marca e dos materiais deverá cessar imediatamente, ressalvada guarda documental obrigatória.',
        ],
      },
      {
        title: '8. PARTICIPAÇÃO ECONÔMICA',
        paragraphs: [
          'Durante Ativação Financeira válida, o Gestor fará jus a 40% (quarenta por cento) da Taxa da Plataforma Elegível relativa às Operações Elegíveis reconhecidas dentro do Território Operacional Atribuído.',
          'O percentual incide sobre a taxa operacional da KAVIAR, e não sobre o valor integral da corrida ou operação.',
          'Custos internos ou centrais da KAVIAR, tributos próprios da KAVIAR, infraestrutura, meios de pagamento, tecnologia, seguros, campanhas e gratificações ou incentivos financiados pela KAVIAR, inclusive eventual gratificação anual a motoristas, não reduzem os 40% do Gestor.',
          'Operações em Área Reservada KAVIAR ou Área de Sombra geram 0% ao Gestor e 100% da Taxa da Plataforma Elegível permanece com a KAVIAR.',
          'Alteração do percentual econômico de 40% exige formalização escrita e efeito exclusivamente prospectivo.',
        ],
      },
      {
        title: '9. FATO GERADOR E OPERAÇÃO ELEGÍVEL',
        paragraphs: [
          'A participação econômica somente nasce quando, cumulativamente: (i) a operação foi concluída; (ii) a receita ou taxa correspondente foi efetivamente reconhecida; (iii) a Ativação Financeira do Gestor estava válida no instante de reconhecimento; (iv) o território da operação era o Território Operacional Atribuído na versão aplicável; e (v) não havia cancelamento, fraude, estorno integral, chargeback ou reversão definitiva impeditiva.',
          'Para fins de alocação territorial das corridas no sistema atual, prevalece o território associado ao bairro de origem da corrida (origin_neighborhood_id) no momento do settlement. Alteração futura desse critério técnico exigirá atualização expressa deste Contrato ou de aditivo aplicável antes de produzir efeitos econômicos.',
          'Reversões posteriores poderão gerar ajuste proporcional em competência subsequente, sempre identificadas no demonstrativo.',
        ],
      },
      {
        title: '10. APURAÇÃO, CONTESTAÇÃO E PAGAMENTO',
        paragraphs: [
          'A apuração ocorrerá por mês-calendário, com fechamento no último dia do mês.',
          'O demonstrativo será disponibilizado, sempre que tecnicamente possível, até o 5º dia útil do mês subsequente.',
          'O Gestor terá 5 dias úteis após a disponibilização para apresentar contestação fundamentada. A ausência de contestação não impede correção de erro material, fraude ou duplicidade comprovada.',
          'O pagamento de valores incontroversos será realizado até o 15º dia útil do mês subsequente, condicionado ao cadastro regular e à apresentação de documento fiscal quando legalmente exigível.',
          'Documento fiscal apresentado fora do prazo operacional poderá deslocar o pagamento para o ciclo seguinte ou para até 10 dias úteis após sua validação, o que ocorrer primeiro conforme o calendário financeiro.',
          'Valor mínimo de repasse: R$ 50,00, acumulando-se saldo inferior para o ciclo seguinte, salvo condição mais favorável formalizada.',
        ],
      },
      {
        title: '11. TRIBUTOS E RETENÇÕES',
        paragraphs: [
          'Tributos próprios da KAVIAR não reduzem a base percentual de 40% do Gestor.',
          'Retenções tributárias ou previdenciárias que a legislação imponha à KAVIAR na condição de fonte pagadora poderão ser descontadas exclusivamente do valor devido ao Gestor, com a correspondente comprovação, sem alteração da base percentual pactuada.',
        ],
      },
      {
        title: '12. ÁREA RESERVADA, BOA-FÉ E ALTERAÇÕES TERRITORIAIS',
        paragraphs: [
          'A KAVIAR poderá manter ou criar Áreas Reservadas para operação direta, expansão, pontos estratégicos, pilotos, parceiros ou outros fins operacionais legítimos.',
          'A KAVIAR não realizará reclassificação territorial com efeito retroativo nem utilizará a criação ou ampliação de Área Reservada com a finalidade exclusiva de suprimir participação econômica já constituída ou relativa a operações anteriormente reconhecidas.',
          'A versão territorial vigente será identificada no Anexo Territorial e deverá ser tecnicamente reconhecível pelo backend para produzir efeitos financeiros.',
        ],
      },
      {
        title: '13. CONFIDENCIALIDADE',
        paragraphs: [
          'O Gestor manterá sigilo sobre informações comerciais, técnicas, financeiras, operacionais, credenciais e dados não públicos acessados em razão da parceria.',
          'A obrigação permanece após o encerramento enquanto a informação mantiver caráter confidencial ou pelo prazo legal aplicável.',
          'É vedado compartilhar credenciais ou permitir acesso de terceiros não autorizados aos sistemas da KAVIAR.',
        ],
      },
      {
        title: '14. PROTEÇÃO DE DADOS PESSOAIS',
        paragraphs: [
          'O tratamento de dados pessoais obedecerá à Lei nº 13.709/2018 e ao Anexo LGPD III, parte integrante deste Contrato.',
          'Quando tratar dados exclusivamente por instrução da KAVIAR, o Gestor atuará como operador, sem prejuízo de qualificação diversa que decorra da lei ou de tratamento realizado para finalidade própria e legítima.',
          'Incidente ou suspeita relevante envolvendo dados pessoais deverá ser comunicado à KAVIAR em até 24 horas da ciência, com as informações disponíveis no momento e complementações posteriores.',
        ],
      },
      {
        title: '15. INTEGRIDADE E ANTICORRUPÇÃO',
        paragraphs: [
          'O Gestor observará a legislação anticorrupção aplicável e não poderá, direta ou indiretamente, prometer, oferecer, autorizar ou conceder vantagem indevida a agente público ou terceiro relacionado.',
          'O Gestor não representará a KAVIAR perante Prefeituras, Câmaras Municipais, autarquias, órgãos reguladores ou agentes públicos sem autorização expressa.',
          'Nenhum pagamento, presente, doação, contribuição política ou despesa de relacionamento poderá ser realizado em nome da KAVIAR sem autorização formal.',
        ],
      },
      {
        title: '16. VIGÊNCIA, SUSPENSÃO E RESCISÃO',
        paragraphs: [
          'O Contrato vigorará por prazo indeterminado a partir da assinatura, sem que a assinatura implique Ativação Financeira.',
          'Qualquer parte poderá rescindir sem justa causa mediante aviso prévio escrito de 30 dias.',
          'A KAVIAR poderá suspender acessos ou a Ativação Financeira em caso de fraude, irregularidade, exigência legal ou regulatória, incidente de segurança, descumprimento contratual ou risco operacional relevante.',
          'A rescisão imediata por justa causa será admitida em caso de violação grave deste Contrato.',
          'Após a data efetiva de encerramento, não surgirá participação sobre novas operações. Valores já reconhecidos permanecem sujeitos apenas a ajustes objetivos, estornos, reversões ou fraude comprovada.',
          'A rescisão não gera propriedade sobre território, comissão sobre operações futuras ou direito perpétuo de participação.',
        ],
      },
      {
        title: '17. RESPONSABILIDADE, FORÇA MAIOR E REGULAÇÃO',
        paragraphs: [
          'Cada parte responde pelos próprios atos ilícitos, descumprimentos e obrigações legalmente atribuídas.',
          'Suspensão ou limitação decorrente de ordem de autoridade, alteração regulatória, indisponibilidade grave de infraestrutura, caso fortuito ou força maior será tratada conforme seus efeitos concretos e não gera automaticamente indenização por operações futuras não realizadas.',
        ],
      },
      {
        title: '18. COMUNICAÇÕES, CESSÃO, TOLERÂNCIA E NULIDADE PARCIAL',
        paragraphs: [
          'Comunicações formais poderão ocorrer pelo e-mail cadastrado, painel da Plataforma KAVIAR ou outro canal eletrônico com registro de envio.',
          'O Gestor não poderá ceder ou transferir este Contrato, seu acesso ou a atribuição territorial sem autorização escrita da KAVIAR.',
          'A KAVIAR poderá transferir este Contrato em reorganização societária, incorporação, fusão, cisão ou sucessão do negócio, mediante comunicação ao Gestor.',
          'A tolerância quanto ao descumprimento não constitui renúncia, novação ou alteração contratual.',
          'A invalidade de uma disposição não invalida as demais, que permanecerão eficazes na máxima extensão permitida por lei.',
        ],
      },
      {
        title: '19. DOCUMENTOS, ASSINATURA ELETRÔNICA E HIERARQUIA',
        paragraphs: [
          'O Contrato poderá ser assinado eletronicamente. A KAVIAR poderá registrar versão, identidade do signatário, documento, e-mail, IP, user-agent, data/hora, método de autenticação e hash SHA-256 do documento submetido.',
          'Integram este instrumento: Contrato Principal, Anexo Comercial I, Anexo Territorial II e Anexo LGPD III.',
          'Em matéria econômica e operacional específica, prevalecerá a seguinte ordem: Contrato Principal > Anexo Comercial I > Anexo Territorial II quanto à delimitação geográfica > Anexo LGPD III quanto a dados pessoais > políticas operacionais gerais, salvo aditivo posterior expressamente firmado.',
          'Comunicações verbais, materiais publicitários ou mensagens informais não alteram o Contrato.',
        ],
      },
      {
        title: '20. FORO',
        paragraphs: [
          'Fica eleito o Foro da Comarca da Capital do Estado do Rio de Janeiro/RJ para dirimir questões decorrentes deste Contrato, ressalvadas hipóteses legais de competência obrigatória.',
        ],
      },
    ],
  };

  const commercial: ContractPart = {
    title: 'ANEXO COMERCIAL I — PARTICIPAÇÃO TERRITORIAL',
    subtitle: `Versão ${TERRITORIAL_MANAGER_CONTRACT_VERSION}`,
    metadata: [
      ...party,
      `Território: ${input.territory.name} — ${input.territory.cityUf}`,
      'Ativação Financeira: NÃO ATIVADA POR ESTE ANEXO; depende de registro específico no sistema.',
    ],
    sections: [
      {
        title: '1. PARTICIPAÇÃO',
        paragraphs: [
          'Com Ativação Financeira válida, o Gestor fará jus a 40% da Taxa da Plataforma Elegível reconhecida nas Operações Elegíveis do Território Operacional Atribuído.',
        ],
      },
      {
        title: '2. REFERÊNCIA DE TAXA',
        paragraphs: [
          'Na política atualmente adotada para corridas, a taxa operacional de referência da KAVIAR é 18% do valor da corrida. Essa referência de preço pode mudar sem alterar automaticamente o percentual contratual de 40% do Gestor.',
        ],
      },
      {
        title: '3. EXEMPLOS ILUSTRATIVOS',
        bullets: [
          'Território financeiramente ativo: corrida de R$ 100,00 → taxa da plataforma R$ 18,00 → Gestor R$ 7,20 (40%) → KAVIAR R$ 10,80 (60%).',
          'Área Reservada KAVIAR / Área de Sombra: corrida de R$ 100,00 → taxa da plataforma R$ 18,00 → Gestor R$ 0,00 → KAVIAR R$ 18,00 (100%).',
        ],
      },
      {
        title: '4. EXCLUSÕES E AJUSTES',
        paragraphs: [
          'Cancelamento, não cobrança, fraude, estorno integral, chargeback ou reversão definitiva não geram participação. Reversões posteriores poderão gerar ajuste proporcional identificado no demonstrativo.',
        ],
      },
      {
        title: '5. ATIVAÇÃO',
        paragraphs: [
          'Não há taxa obrigatória de adesão ou habilitação nesta versão. Cadastro, assinatura, geração do contrato e acesso ao painel não ativam participação econômica.',
        ],
      },
    ],
  };

  const territorial: ContractPart = {
    title: 'ANEXO TERRITORIAL II — DELIMITAÇÃO E VERSÃO',
    subtitle: `Versão contratual ${TERRITORIAL_MANAGER_CONTRACT_VERSION}`,
    metadata: territoryMetadata,
    sections: [
      {
        title: '1. REGRA DE DELIMITAÇÃO',
        paragraphs: [
          'O território remunerado corresponde exclusivamente ao territory_id e à composição territorial registrados nesta versão. A cidade ou município não é, por si só, território remunerado.',
        ],
      },
      {
        title: '2. CRITÉRIO TÉCNICO DE ALOCAÇÃO DA CORRIDA',
        paragraphs: [
          'Na versão atual do backend, a corrida é associada ao território do bairro de origem (origin_neighborhood_id) no momento do settlement. Somente operação cujo bairro de origem esteja vinculado a este territory_id poderá ser considerada territorialmente elegível, observados os demais requisitos do Contrato.',
        ],
      },
      {
        title: '3. ÁREAS RESERVADAS',
        paragraphs: [
          'Áreas não vinculadas a este territory_id, ou vinculadas a território sem assignment financeiro ativo para o Gestor, não integram a participação econômica e podem constituir Área Reservada KAVIAR / Área de Sombra.',
        ],
      },
      {
        title: '4. VERSIONAMENTO',
        paragraphs: [
          'A versão territorial indicada neste Anexo é a referência probatória da delimitação existente na geração do documento. Alterações posteriores somente produzem efeitos prospectivos e devem permanecer auditáveis no sistema.',
        ],
      },
    ],
  };

  const lgpd: ContractPart = {
    title: 'ANEXO LGPD III — TRATAMENTO DE DADOS PESSOAIS',
    subtitle: `Versão ${TERRITORIAL_MANAGER_CONTRACT_VERSION}`,
    metadata: [
      `Controladora: ${COMPANY.legalName} — CNPJ ${COMPANY.cnpj}`,
      `Gestor: ${input.displayName}`,
    ],
    sections: [
      {
        title: '1. PAPÉIS',
        paragraphs: [
          'A KAVIAR atua como Controladora dos dados pessoais tratados para operação da Plataforma. O Gestor atua como Operador quando tratar dados exclusivamente segundo instruções documentadas da KAVIAR, ressalvados tratamentos próprios exigidos por lei ou realizados sob base legal própria.',
        ],
      },
      {
        title: '2. FINALIDADES E MINIMIZAÇÃO',
        paragraphs: [
          'O Gestor tratará somente dados necessários às atividades autorizadas de captação, suporte, acompanhamento territorial e comunicação operacional, no limite do acesso disponibilizado.',
          'É vedado usar dados para finalidade particular, comercialização própria, enriquecimento de base, publicidade independente ou finalidade incompatível.',
        ],
      },
      {
        title: '3. CATEGORIAS DE DADOS',
        paragraphs: [
          'O acesso poderá abranger dados de identificação, contato, cadastro, território, status operacional e informações de corridas estritamente necessárias ao papel do Gestor.',
          'Dados pessoais sensíveis somente poderão ser tratados quando expressamente disponibilizados e necessários à finalidade autorizada, observadas instruções específicas da KAVIAR.',
        ],
      },
      {
        title: '4. SEGURANÇA E CONTROLE DE ACESSO',
        bullets: [
          'Usar credenciais individuais e mantê-las sob sigilo.',
          'Não compartilhar conta, senha, token, exportação ou captura de dados com pessoa não autorizada.',
          'Aplicar medidas razoáveis de segurança em dispositivo e conexão utilizados.',
          'Não copiar ou exportar bases de dados salvo funcionalidade e finalidade expressamente autorizadas.',
          'Comunicar imediatamente perda de credencial, dispositivo comprometido ou acesso indevido.',
        ],
      },
      {
        title: '5. INCIDENTES',
        paragraphs: [
          'O Gestor comunicará à KAVIAR qualquer incidente ou suspeita relevante envolvendo dados pessoais em até 24 horas da ciência.',
          'A comunicação inicial conterá as informações disponíveis e será complementada sem demora injustificada, inclusive natureza do incidente, dados potencialmente afetados, titulares, medidas adotadas e contatos envolvidos.',
          'O Gestor não realizará comunicação externa em nome da KAVIAR à ANPD, titulares, imprensa ou terceiros sem autorização, salvo obrigação legal própria.',
        ],
      },
      {
        title: '6. SUBOPERADORES E TERCEIROS',
        paragraphs: [
          'O Gestor não contratará suboperador nem compartilhará dados pessoais com terceiro para executar atividades da KAVIAR sem autorização prévia e escrita.',
          'Transferência internacional ou armazenamento em serviço externo não autorizado é vedado.',
        ],
      },
      {
        title: '7. RETENÇÃO, DEVOLUÇÃO E ELIMINAÇÃO',
        paragraphs: [
          'Encerrada a finalidade ou o Contrato, o Gestor cessará o acesso e eliminará ou devolverá cópias de dados sob sua guarda, ressalvadas hipóteses legais de conservação.',
          'A KAVIAR poderá revogar acessos imediatamente no encerramento ou em situação de risco.',
        ],
      },
      {
        title: '8. COOPERAÇÃO E AUDITORIA',
        paragraphs: [
          'O Gestor cooperará com solicitações razoáveis da KAVIAR relacionadas a direitos de titulares, segurança, investigação de incidentes e demonstração de conformidade.',
          'A KAVIAR poderá auditar registros e evidências relacionados ao tratamento realizado em seu nome, respeitada a proporcionalidade e a confidencialidade.',
        ],
      },
      {
        title: '9. CONFIDENCIALIDADE',
        paragraphs: [
          'As obrigações de confidencialidade e proteção de dados permanecem após o encerramento enquanto houver dados pessoais ou informações protegidas sob responsabilidade do Gestor.',
        ],
      },
    ],
  };

  return {
    version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
    generatedAt: input.generatedAt,
    partyLines: party,
    parts: [principal, commercial, territorial, lgpd],
  };
}

export function renderTerritorialManagerContractMarkdown(
  input: TerritorialManagerContractInput,
): string {
  const doc = buildTerritorialManagerContractV12(input);
  const lines: string[] = [
    '# KAVIAR — Contrato de Parceria Operacional Territorial',
    '',
    `**Versão canônica:** ${doc.version}`,
    '',
    '> Este arquivo é uma representação de referência gerada a partir da mesma definição usada pelo PDF automático.',
    '',
  ];

  for (const part of doc.parts) {
    lines.push(`## ${part.title}`, '');
    if (part.subtitle) lines.push(`**${part.subtitle}**`, '');
    for (const m of part.metadata || []) lines.push(`- ${m}`);
    if ((part.metadata || []).length) lines.push('');

    for (const section of part.sections) {
      lines.push(`### ${section.title}`, '');
      for (const p of section.paragraphs || []) lines.push(p, '');
      for (const b of section.bullets || []) lines.push(`- ${b}`);
      if ((section.bullets || []).length) lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export const TERRITORIAL_MANAGER_CONTRACT_DOC_PLACEHOLDER: TerritorialManagerContractInput = {
  recipientType: 'individual',
  displayName: '[NOME DO GESTOR]',
  email: '[E-MAIL]',
  phone: '[TELEFONE]',
  address: '[ENDEREÇO]',
  cpf: '[CPF]',
  rg: '[RG]',
  territory: {
    id: '[TERRITORY_ID]',
    name: '[TERRITÓRIO]',
    cityUf: '[CIDADE/UF]',
    version: '[VERSÃO TERRITORIAL]',
    neighborhoods: ['[BAIRROS/COMUNIDADES VINCULADOS]'],
  },
  generatedAt: '[DATA DE GERAÇÃO]',
};
