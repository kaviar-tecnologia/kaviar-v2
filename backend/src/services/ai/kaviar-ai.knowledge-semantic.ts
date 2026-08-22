/**
 * RAG v1 — Semantic Knowledge Search
 *
 * Busca semântica em artigos APPROVED quando full-text falha.
 * Usa embeddings em memória (cache no processo) para os ~9 artigos existentes.
 * Estritamente read-only. Não altera banco, não cria migration.
 */
import OpenAI from 'openai';
import { pool } from '../../db';

// ── Configuration ─────────────────────────────────────────────────────────

/** Threshold mínimo de similaridade cosseno para considerar match confiável */
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.58;

/** Máximo de snippets retornados */
const MAX_SEMANTIC_RESULTS = 2;

/** Máximo de caracteres por snippet */
const MAX_SNIPPET_CHARS = 2000;

/** Modelo de embeddings */
const EMBEDDING_MODEL = 'text-embedding-3-small';

// ── Types ─────────────────────────────────────────────────────────────────

export type SemanticCitation = {
  title: string;
  slug: string;
  version: number;
};

export type SemanticSearchResult = {
  available: boolean;
  matched: boolean;
  score: number | null;
  snippets: string[];
  citations: SemanticCitation[];
};

type CachedArticle = {
  slug: string;
  title: string;
  version: number;
  contentMd: string;
  allowedRoles: string[];
  embedding: number[];
};

// ── In-memory cache ───────────────────────────────────────────────────────

let articlesCache: CachedArticle[] | null = null;
let cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads APPROVED articles and computes embeddings.
 * Cached in process memory; reloaded after TTL expires.
 */
async function loadArticlesWithEmbeddings(client: OpenAI): Promise<CachedArticle[]> {
  const now = Date.now();

  if (articlesCache && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    return articlesCache;
  }

  // Load all APPROVED articles
  const result = await pool.query<{
    slug: string;
    title: string;
    version: number;
    content_md: string;
    allowed_roles: string[];
  }>(`
    SELECT slug, title, version, LEFT(content_md, $1) AS content_md, allowed_roles
    FROM knowledge_articles
    WHERE status = 'APPROVED'
      AND knowledge_scope = 'CURRENT'
    ORDER BY slug
  `, [MAX_SNIPPET_CHARS]);

  if (result.rows.length === 0) {
    articlesCache = [];
    cacheLoadedAt = now;
    return [];
  }

  // Generate embeddings for all articles in one batch
  const texts = result.rows.map(r => `${r.title}\n${r.content_md}`);

  const embeddingResponse = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  const articles: CachedArticle[] = result.rows.map((row, i) => ({
    slug: row.slug,
    title: row.title,
    version: row.version,
    contentMd: row.content_md,
    allowedRoles: row.allowed_roles,
    embedding: embeddingResponse.data[i].embedding,
  }));

  articlesCache = articles;
  cacheLoadedAt = now;
  return articles;
}

// ── Math ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ── Main search function ──────────────────────────────────────────────────

/**
 * Performs semantic search over APPROVED knowledge articles.
 * Returns matched snippets with citations if similarity exceeds threshold.
 *
 * @param question - The user's question
 * @param role - User's role (for RBAC filtering)
 * @returns Structured result with snippets and citations, or noMatch
 */
export async function searchKnowledgeSemantic(
  question: string,
  role: string
): Promise<SemanticSearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { available: false, matched: false, score: null, snippets: [], citations: [] };
  }

  const client = new OpenAI({ apiKey, timeout: 15_000, maxRetries: 1 });

  let articles: CachedArticle[];
  try {
    articles = await loadArticlesWithEmbeddings(client);
  } catch {
    return { available: false, matched: false, score: null, snippets: [], citations: [] };
  }

  if (articles.length === 0) {
    return { available: true, matched: false, score: null, snippets: [], citations: [] };
  }

  // Filter by role
  const roleFiltered = articles.filter(a => a.allowedRoles.includes(role));
  if (roleFiltered.length === 0) {
    return { available: true, matched: false, score: null, snippets: [], citations: [] };
  }

  // Embed the question
  let questionEmbedding: number[];
  try {
    const qResponse = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: question,
    });
    questionEmbedding = qResponse.data[0].embedding;
  } catch {
    return { available: false, matched: false, score: null, snippets: [], citations: [] };
  }

  // Compute similarities and rank
  const scored = roleFiltered.map(article => ({
    article,
    score: cosineSimilarity(questionEmbedding, article.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Apply threshold
  const topResults = scored
    .filter(s => s.score >= SEMANTIC_SIMILARITY_THRESHOLD)
    .slice(0, MAX_SEMANTIC_RESULTS);

  if (topResults.length === 0) {
    const bestScore = scored.length > 0 ? scored[0].score : null;
    return { available: true, matched: false, score: bestScore, snippets: [], citations: [] };
  }

  return {
    available: true,
    matched: true,
    score: topResults[0].score,
    snippets: topResults.map(r => `[${r.article.title}]\n${r.article.contentMd}`),
    citations: topResults.map(r => ({
      title: r.article.title,
      slug: r.article.slug,
      version: r.article.version,
    })),
  };
}

/**
 * Clears the in-memory cache. Useful for testing.
 * @internal
 */
export function clearSemanticCache(): void {
  articlesCache = null;
  cacheLoadedAt = 0;
}
