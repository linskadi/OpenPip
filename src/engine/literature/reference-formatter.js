function formatGB7714(entry) {
  const authors = formatAuthorsGB7714(entry.authors);
  let formatted = `${authors}. ${entry.title}[J]. ${entry.journal}`;
  
  if (entry.year) formatted += `, ${entry.year}`;
  if (entry.volume) formatted += `, ${entry.volume}`;
  if (entry.issue) formatted += `(${entry.issue})`;
  if (entry.pages) formatted += `: ${entry.pages}`;
  formatted += '.';
  
  if (entry.doi) formatted += ` DOI: ${entry.doi}`;
  
  return formatted;
}

function formatAuthorsGB7714(authors) {
  if (!authors || authors.length === 0) return '未知作者';
  
  if (authors.length <= 3) {
    return authors.join(', ');
  }
  
  return `${authors.slice(0, 3).join(', ')} 等`;
}

function exportAsBibTeX(entries) {
  return entries.map(entry => {
    const type = entry.type === 'conference' ? 'inproceedings' : entry.type;
    const authors = entry.authors.join(' and ');
    
    let bib = `@${type}{${entry.id},\n`;
    bib += `  title = {${entry.title}},\n`;
    bib += `  author = {${authors}},\n`;
    bib += `  year = {${entry.year}},\n`;
    
    if (entry.journal) bib += `  journal = {${entry.journal}},\n`;
    if (entry.volume) bib += `  volume = {${entry.volume}},\n`;
    if (entry.issue) bib += `  number = {${entry.issue}},\n`;
    if (entry.pages) bib += `  pages = {${entry.pages}},\n`;
    if (entry.doi) bib += `  doi = {${entry.doi}},\n`;
    if (entry.abstract) bib += `  abstract = {${entry.abstract}},\n`;
    if (entry.keywords.length) bib += `  keywords = {${entry.keywords.join(', ')}},\n`;
    
    bib += '}\n';
    
    return bib;
  }).join('\n');
}

function exportAsCSV(entries) {
  const headers = ['Title', 'Authors', 'Year', 'Journal', 'DOI', 'Keywords'];
  const rows = entries.map(entry => [
    `"${entry.title.replace(/"/g, '""')}"`,
    `"${entry.authors.join('; ')}"`,
    entry.year,
    `"${entry.journal}"`,
    `"${entry.doi}"`,
    `"${entry.keywords.join('; ')}"`,
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function generateReferenceList(entries, options = {}) {
  const { sort = 'year', limit = null } = options;
  
  let sorted = [...entries];
  
  if (sort === 'year') {
    sorted.sort((a, b) => a.year - b.year);
  } else if (sort === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'author') {
    sorted.sort((a, b) => {
      const authorA = a.authors[0] || '';
      const authorB = b.authors[0] || '';
      return authorA.localeCompare(authorB);
    });
  }
  
  if (limit && sorted.length > limit) {
    sorted = sorted.slice(0, limit);
  }
  
  return sorted.map((entry, index) => {
    const formatted = formatGB7714(entry);
    return `[${index + 1}] ${formatted}`;
  });
}

module.exports = {
  formatGB7714,
  formatAuthorsGB7714,
  exportAsBibTeX,
  exportAsCSV,
  generateReferenceList,
};
