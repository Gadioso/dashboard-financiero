import { NextResponse } from 'next/server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type GdeltArticle = {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

type Topic = {
  id: 'geopolitics' | 'rates' | 'crypto' | 'technology';
  label: string;
  whyItMatters: string;
  watchNext: string;
  beginnerContext: string;
};

const trustedDomains = new Set([
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'ft.com', 'wsj.com', 'bloomberg.com',
  'cnbc.com', 'economist.com', 'nytimes.com', 'theguardian.com', 'federalreserve.gov',
  'ecb.europa.eu', 'banxico.org.mx', 'imf.org', 'worldbank.org', 'eia.gov', 'sec.gov',
  'coinbase.com', 'coindesk.com', 'theblock.co', 'fortune.com',
]);

const topics: Topic[] = [
  {
    id: 'geopolitics', label: 'Geopolítica y energía',
    whyItMatters: 'Conflictos, sanciones y rutas energéticas pueden mover petróleo, inflación, monedas y bolsas globales.',
    watchNext: 'Precio del petróleo, transporte marítimo, nuevas sanciones y respuestas de gobiernos.',
    beginnerContext: 'Si sube la energía, producir y transportar cuesta más; eso puede presionar precios y tasas.',
  },
  {
    id: 'rates', label: 'Tasas, inflación y economía',
    whyItMatters: 'Las tasas cambian el costo del crédito y la valuación de bonos, acciones, vivienda y monedas.',
    watchNext: 'Inflación, empleo y mensajes de bancos centrales; una noticia aislada no define la tendencia.',
    beginnerContext: 'Tasas altas suelen encarecer créditos y hacer más atractivos algunos instrumentos de deuda.',
  },
  {
    id: 'crypto', label: 'Bitcoin y ecosistema cripto',
    whyItMatters: 'Regulación, adopción, liquidez y seguridad de redes suelen importar más que una predicción aislada de precio.',
    watchNext: 'Flujos institucionales, actividad de red, concentración, tokenomics, auditorías y cambios regulatorios.',
    beginnerContext: 'Que un token sea nuevo o “descentralizado” no basta: hay que revisar uso real, oferta, control y liquidez.',
  },
  {
    id: 'technology', label: 'Tecnología, comercio y empresas',
    whyItMatters: 'Chips, IA, aranceles y cadenas de suministro afectan costos, crecimiento y utilidades empresariales.',
    watchNext: 'Resultados corporativos, inversión real, márgenes, restricciones comerciales y demanda.',
    beginnerContext: 'Una gran historia tecnológica no siempre significa que cualquier acción del sector esté barata.',
  },
];

function rootDomain(value: string) {
  return value.toLowerCase().replace(/^www\./, '');
}

function isTrusted(article: GdeltArticle) {
  const domain = rootDomain(article.domain || '');
  return [...trustedDomains].some((trusted) => domain === trusted || domain.endsWith(`.${trusted}`));
}

function sourceLabel(domain: string) {
  return rootDomain(domain).split('.')[0]?.replace(/^./, (letter) => letter.toUpperCase()) || 'Fuente';
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function fetchGoogleNewsFallback() {
  const query = 'markets (Iran OR Hormuz OR Ukraine OR inflation OR Federal Reserve OR Bitcoin OR Ethereum OR semiconductors OR tariffs)';
  const response = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, {
    next: { revalidate: 300 }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const allowedSources = new Set(['Reuters', 'Associated Press', 'BBC', 'Financial Times', 'Bloomberg', 'CNBC', 'The Economist', 'The Wall Street Journal', 'Federal Reserve', 'IMF', 'World Bank', 'CoinDesk']);
  const counts = new Map<string, number>();
  return items.flatMap((item) => {
    const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim();
    const url = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim();
    const source = decodeXml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '').trim();
    const publishedAt = decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
    if (!title || !url || !allowedSources.has(source)) return [];
    const topic = detectTopic({ title, url });
    if ((counts.get(topic.id) || 0) >= 3) return [];
    counts.set(topic.id, (counts.get(topic.id) || 0) + 1);
    return [{ id: `${topic.id}:${url}`, topic: topic.id, topicLabel: topic.label, headline: title, url, source, domain: 'news.google.com', publishedAt, whyItMatters: topic.whyItMatters, watchNext: topic.watchNext, beginnerContext: topic.beginnerContext }];
  });
}

function detectTopic(article: GdeltArticle) {
  const text = `${article.title || ''} ${article.url || ''}`.toLowerCase();
  if (/bitcoin|ethereum|crypto|stablecoin|blockchain|token/.test(text)) return topics.find((topic) => topic.id === 'crypto')!;
  if (/iran|hormuz|ukrain|russia|sanction|oil|energy|war/.test(text)) return topics.find((topic) => topic.id === 'geopolitics')!;
  if (/fed|central bank|banxico|ecb|inflation|interest rate|bond|empleo|jobs/.test(text)) return topics.find((topic) => topic.id === 'rates')!;
  return topics.find((topic) => topic.id === 'technology')!;
}

async function fetchBriefing() {
  const combinedQuery = '("Strait of Hormuz" OR Iran OR Ukraine OR sanctions OR oil OR "Federal Reserve" OR ECB OR Banxico OR inflation OR "interest rates" OR Bitcoin OR Ethereum OR stablecoin OR cryptocurrency OR semiconductors OR "artificial intelligence" OR tariffs) (market OR economy OR stocks OR regulation OR investment)';
  const params = new URLSearchParams({
    query: combinedQuery,
    mode: 'artlist',
    maxrecords: '100',
    timespan: '48h',
    sort: 'datedesc',
    format: 'json',
  });
  const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
    next: { revalidate: 300 }, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`GDELT respondió ${response.status}.`);
  const raw = await response.text();
  let payload: { articles?: GdeltArticle[] };
  try { payload = JSON.parse(raw) as { articles?: GdeltArticle[] }; } catch { throw new Error('GDELT no devolvió noticias estructuradas.'); }
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  return (payload.articles || []).filter((article) => {
    const key = String(article.url || article.title || '');
    if (!article.url || !article.title || seen.has(key) || !isTrusted(article)) return false;
    const topic = detectTopic(article);
    if ((counts.get(topic.id) || 0) >= 3) return false;
    seen.add(key); counts.set(topic.id, (counts.get(topic.id) || 0) + 1); return true;
  }).map((article) => {
    const topic = detectTopic(article);
    return {
      id: `${topic.id}:${article.url}`, topic: topic.id, topicLabel: topic.label,
      headline: article.title!, url: article.url!, source: sourceLabel(article.domain || ''),
      domain: rootDomain(article.domain || ''), publishedAt: article.seendate || null,
      whyItMatters: topic.whyItMatters, watchNext: topic.watchNext, beginnerContext: topic.beginnerContext,
    };
  });
}

export async function GET(request: Request) {
  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  let items: Awaited<ReturnType<typeof fetchBriefing>> = [];
  let unavailableTopics: string[] = [];
  try { items = await fetchBriefing(); } catch { items = await fetchGoogleNewsFallback().catch(() => []); }
  if (!items.length) unavailableTopics = topics.map((topic) => topic.label);
  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    items,
    unavailableTopics,
    methodology: 'Titulares recientes de fuentes seleccionadas, descubiertos mediante GDELT y un respaldo de Google News. Virafi separa el hecho publicado de su explicación educativa y no predice rendimientos.',
  });
}
