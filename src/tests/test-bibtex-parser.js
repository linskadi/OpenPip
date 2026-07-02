// 测试 bibtex-parser 模块
const {
  parseBibTeX,
  mapBibTeXType,
  extractBibTeXField,
  extractBibTeXAuthors,
  extractBibTeXKeywords,
} = require('../engine/literature/bibtex-parser');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

// ── parseBibTeX ──
console.log('=== parseBibTeX ===');
const sampleBib = `@article{zhang2024deep,
  title = "Deep Learning for Fault Diagnosis",
  author = "Zhang Wei and Li Ming",
  journal = "Journal of Mechanical Engineering",
  year = "2024",
  volume = "60",
  number = "3",
  pages = "1--10",
  doi = "10.1234/jme.2024.001",
  keywords = "deep learning, fault diagnosis, CNN",
  abstract = "This paper proposes a deep learning method for fault diagnosis."
}`;

const entries = parseBibTeX(sampleBib);
assert(Array.isArray(entries), 'parseBibTeX returns array');
assert(entries.length === 1, `parsed 1 entry (got ${entries.length})`);

const entry = entries[0];
assert(entry.type === 'article', `type=article (got ${entry.type})`);
assert(entry.id === 'zhang2024deep', `id=zhang2024deep (got ${entry.id})`);
assert(entry.title === 'Deep Learning for Fault Diagnosis', `title extracted (got "${entry.title}")`);
assert(entry.authors.length === 2, `2 authors (got ${entry.authors.length})`);
assert(entry.authors[0] === 'Zhang Wei', `first author=Zhang Wei (got "${entry.authors[0]}")`);
assert(entry.year === 2024, `year=2024 (got ${entry.year})`);
assert(entry.journal === 'Journal of Mechanical Engineering', `journal extracted (got "${entry.journal}")`);
assert(entry.volume === '60', `volume=60 (got "${entry.volume}")`);
assert(entry.issue === '3', `issue=3 (got "${entry.issue}")`);
assert(entry.pages === '1--10', `pages extracted (got "${entry.pages}")`);
assert(entry.doi === '10.1234/jme.2024.001', `doi extracted (got "${entry.doi}")`);
assert(entry.keywords.length === 3, `3 keywords (got ${entry.keywords.length})`);
assert(entry.abstract.includes('fault diagnosis'), 'abstract extracted');

// ── parseBibTeX: multiple entries ──
console.log('\n=== Multiple entries ===');
const multiBib = `@book{smith2023book,
  title = "Advanced Algorithms",
  author = "Smith John",
  year = "2023",
  publisher = "Springer"
}
@inproceedings{wang2024conf,
  title = "A Conference Paper",
  author = "Wang Chen",
  booktitle = "Proceedings of ICML",
  year = "2024"
}`;
const multi = parseBibTeX(multiBib);
assert(multi.length === 2, `2 entries parsed (got ${multi.length})`);
assert(multi[0].type === 'book', `first is book (got ${multi[0].type})`);
assert(multi[1].type === 'conference', `second is conference (got ${multi[1].type})`);

// ── mapBibTeXType ──
console.log('\n=== mapBibTeXType ===');
assert(mapBibTeXType('article') === 'article', 'article -> article');
assert(mapBibTeXType('book') === 'book', 'book -> book');
assert(mapBibTeXType('inproceedings') === 'conference', 'inproceedings -> conference');
assert(mapBibTeXType('phdthesis') === 'thesis', 'phdthesis -> thesis');
assert(mapBibTeXType('techreport') === 'report', 'techreport -> report');
assert(mapBibTeXType('unknown') === 'article', 'unknown -> article (default)');

// ── extractBibTeXField ──
console.log('\n=== extractBibTeXField ===');
const fields = 'title = "Test Title", year = "2024", author = "Test Author"';
assert(extractBibTeXField(fields, 'title') === 'Test Title', 'extract title');
assert(extractBibTeXField(fields, 'year') === '2024', 'extract year');
assert(extractBibTeXField(fields, 'missing') === '', 'missing field returns empty');

// ── extractBibTeXAuthors ──
console.log('\n=== extractBibTeXAuthors ===');
const authors = extractBibTeXAuthors('Alice and Bob & Charlie');
assert(authors.length === 3, `3 authors (got ${authors.length})`);
assert(authors[0] === 'Alice', 'first author Alice');
assert(authors[1] === 'Bob', 'second author Bob');
assert(authors[2] === 'Charlie', 'third author Charlie');
assert(extractBibTeXAuthors('').length === 0, 'empty string returns empty array');

// ── extractBibTeXKeywords ──
console.log('\n=== extractBibTeXKeywords ===');
const kws = extractBibTeXKeywords('AI, machine learning; deep learning');
assert(kws.length === 3, `3 keywords (got ${kws.length})`);
assert(kws[0] === 'AI', 'first keyword AI');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
