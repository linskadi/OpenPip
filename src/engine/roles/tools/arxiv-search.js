const { classifyFetchError } = require('../../llm/fetch-helper');

const ARXIV_API = 'http://export.arxiv.org/api/query';

async function searchArxiv(query, maxResults = 5) {
  const params = new URLSearchParams({
    search_query: buildQuery(query),
    start: '0',
    max_results: String(maxResults),
    sortBy: 'relevance',
    sortOrder: 'descending',
  });

  const url = `${ARXIV_API}?${params}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    const classified = classifyFetchError(err);
    return { success: false, error: `arXiv API 请求失败: ${classified.message}` };
  }

  if (!response.ok) {
    return { success: false, error: `arXiv API HTTP ${response.status}` };
  }

  const xml = await response.text();
  try {
    return parseArxivResponse(xml, maxResults);
  } catch (err) {
    return { success: false, error: `解析 arXiv 响应失败: ${err.message}` };
  }
}

function buildQuery(text) {
  const cleaned = text.replace(/[^\w\s\u4e00-\u9fff]/g, ' ').trim();
  const terms = cleaned.split(/\s+/).filter(t => t.length > 1).slice(0, 10);
  return terms.map(t => `all:${encodeURIComponent(t)}`).join('+AND+');
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : '';
}

function extractAllTags(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

function parseArxivResponse(xml, maxResults) {
  const entries = xml.split('<entry>').slice(1);

  const papers = entries.slice(0, maxResults).map(entryXml => {
    const e = `<entry>${entryXml}`;
    const title = extractTag(e, 'title').replace(/\s+/g, ' ').trim();
    const authors = extractAllTags(e, 'author').map(a => extractTag(a, 'name')).join(', ');
    const published = extractTag(e, 'published');
    const summary = extractTag(e, 'summary').replace(/\s+/g, ' ').trim().slice(0, 500);
    const links = extractAllTags(e, 'link');
    const link = links.map(l => {
      const hrefMatch = l.match(/href="([^"]+)"/);
      return hrefMatch ? hrefMatch[1] : '';
    }).find(h => h.includes('abs/')) || links.map(l => {
      const hrefMatch = l.match(/href="([^"]+)"/);
      return hrefMatch ? hrefMatch[1] : '';
    })[0] || '';
    const categories = extractAllTags(e, 'category').map(c => {
      const t = c.match(/term="([^"]+)"/);
      return t ? t[1] : '';
    }).filter(Boolean).join(', ');
    return { title, authors, published, summary, link, category: categories };
  });

  const totalMatch = xml.match(/opensearch:totalResults[^>]*>(\d+)</);
  const totalResults = totalMatch ? parseInt(totalMatch[1], 10) : papers.length;

  return { success: true, papers, totalResults };
}

function formatArxivResults(result) {
  if (!result.success) return `[arXiv 检索失败] ${result.error}`;
  if (result.papers.length === 0) return '[arXiv 检索结果为空]';

  const parts = [`## arXiv 检索结果 (共 ${result.totalResults} 篇)\n`];
  for (let i = 0; i < result.papers.length; i++) {
    const p = result.papers[i];
    parts.push(`### ${i + 1}. ${p.title}`);
    parts.push(`- 作者: ${p.authors}`);
    parts.push(`- 日期: ${p.published.slice(0, 10)}`);
    parts.push(`- 分类: ${p.category}`);
    parts.push(`- 链接: ${p.link}`);
    parts.push(`- 摘要: ${p.summary.slice(0, 300)}...`);
    parts.push('');
  }
  return parts.join('\n');
}

module.exports = { searchArxiv, formatArxivResults, buildQuery };
