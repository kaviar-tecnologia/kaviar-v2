/**
 * RAG v1 — Knowledge Answer Tool
 * Busca artigos aprovados por full-text search em português e sintetiza resposta via OpenAI.
 * Somente leitura. Não envia dados sensíveis ao modelo.
 */
import { pool } from '../../db';
import OpenAI from 'openai';

const MAX_QUERY_LENGTH = 200;
const MAX_RESULTS = 3;
const MAX_SNIPPET_LENGTH = 2000;

export type KnowledgeCitation = {
  title: string;
  slug: string;
  version: number;
};

export type KnowledgeAnswerData = {
  available: boolean;
  answer: string;
  citations: KnowledgeCitation[];
  synthesized: boolean;
  noMatch: boolean;
};

/**
 * Busca artigos aprovados, autorizados para a role, e sintetiza resposta.
 */
export async function getKnowledgeAnswer(args?: Record<string, string>): Promise<{
  tool: 'knowledge_answer';
  data: KnowledgeAnswerData;
}> {
  const question = (args?.question ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const role = args?.role ?? '';

  if (!question || !role) {
    return { tool: 'knowledge_answer', data: { available: true, answer: 'Não foi encontrada informação aprovada sobre o tema solicitado.', citations: [], synthesized: false, noMatch: true } };
  }

  // Search approved articles authorized for the role using full-text search
  let articles: { slug: string; title: string; version: number; snippet: string }[];
  try {
    const result = await pool.query<{
      slug: string; title: string; version: number; content_md: string; rank: number;
    }>(`
      SELECT slug, title, version,
             LEFT(content_md, $3) AS content_md,
             ts_rank(search_vector, websearch_to_tsquery('portuguese', $1)) AS rank
      FROM knowledge_articles
      WHERE status = 'APPROVED'
        AND knowledge_scope = 'CURRENT'
        AND $2 = ANY(allowed_roles)
        AND search_vector @@ websearch_to_tsquery('portuguese', $1)
      ORDER BY rank DESC
      LIMIT $4
    `, [question, role, MAX_SNIPPET_LENGTH, MAX_RESULTS]);

    articles = result.rows.map(r => ({
      slug: r.slug,
      title: r.title,
      version: r.version,
      snippet: r.content_md,
    }));
  } catch {
    return { tool: 'knowledge_answer', data: { available: false, answer: 'Não foi possível consultar a base de conhecimento.', citations: [], synthesized: false, noMatch: false } };
  }

  // No match — deterministic response, no model call
  if (articles.length === 0) {
    return { tool: 'knowledge_answer', data: { available: true, answer: 'Não foi encontrada informação aprovada sobre o tema solicitado.', citations: [], synthesized: false, noMatch: true } };
  }

  const citations: KnowledgeCitation[] = articles.map(a => ({ title: a.title, slug: a.slug, version: a.version }));

  // Synthesize answer using OpenAI with retrieved snippets only
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback: return snippets directly without synthesis
    const snippetText = articles.map(a => `[${a.title}]\n${a.snippet}`).join('\n\n');
    return { tool: 'knowledge_answer', data: { available: true, answer: snippetText, citations, synthesized: false, noMatch: false } };
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 15_000, maxRetries: 1 });
    const model = process.env.KAVIAR_AI_MODEL || 'gpt-5.4-mini';

    const context = articles.map(a => `--- ${a.title} ---\n${a.snippet}`).join('\n\n');

    const response = await client.responses.create({
      model,
      instructions: `Você é o assistente do Chat KAVIAR. Responda à pergunta usando SOMENTE as informações dos trechos abaixo. Se os trechos não contiverem resposta suficiente, diga que não encontrou informação aprovada suficiente. Não invente. Não execute ações. Não solicite dados sensíveis. Seja conciso e objetivo.`,
      input: `Pergunta: ${question}\n\nTrechos aprovados:\n${context}`,
      reasoning: { effort: 'low' },
      max_output_tokens: 1024,
      store: false,
    });

    if (response.status === 'completed' && response.output_text) {
      return { tool: 'knowledge_answer', data: { available: true, answer: response.output_text, citations, synthesized: true, noMatch: false } };
    }

    // Fallback on incomplete/failed response
    const snippetText = articles.map(a => `[${a.title}]\n${a.snippet}`).join('\n\n');
    return { tool: 'knowledge_answer', data: { available: true, answer: snippetText, citations, synthesized: false, noMatch: false } };
  } catch {
    // Model failure fallback — return snippets directly
    const snippetText = articles.map(a => `[${a.title}]\n${a.snippet}`).join('\n\n');
    return { tool: 'knowledge_answer', data: { available: true, answer: snippetText, citations, synthesized: false, noMatch: false } };
  }
}
