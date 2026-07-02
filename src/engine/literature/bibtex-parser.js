function parseBibTeX(content) {
  const entries = [];
  let i = 0;

  while (i < content.length) {
    const atPos = content.indexOf('@', i);
    if (atPos === -1) break;

    const typeMatch = content.slice(atPos + 1).match(/^(\w+)\s*\{/);
    if (!typeMatch) {
      i = atPos + 1;
      continue;
    }

    const type = typeMatch[1].toLowerCase();
    const bodyStart = atPos + 1 + typeMatch[0].length;

    const bodyEnd = findMatchingBrace(content, bodyStart - 1);
    if (bodyEnd === -1) break;

    const body = content.slice(bodyStart, bodyEnd);

    const commaPos = body.indexOf(',');
    if (commaPos === -1) {
      i = bodyEnd + 1;
      continue;
    }

    const key = body.slice(0, commaPos).trim();
    const fieldsStr = body.slice(commaPos + 1);

    const fields = parseBibTeXFields(fieldsStr);

    entries.push({
      type: mapBibTeXType(type),
      id: key,
      title: fields.title || '',
      authors: extractBibTeXAuthors(fields.author || ''),
      year: parseInt(fields.year) || new Date().getFullYear(),
      journal: fields.journal || '',
      volume: fields.volume || '',
      issue: fields.number || '',
      pages: fields.pages || '',
      doi: fields.doi || '',
      isbn: fields.isbn || '',
      abstract: fields.abstract || '',
      keywords: extractBibTeXKeywords(fields.keywords || ''),
      url: fields.url || '',
    });

    i = bodyEnd + 1;
  }

  return entries;
}

function findMatchingBrace(str, start) {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = start; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (ch === '\\' && i + 1 < str.length) {
        i++;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function parseBibTeXFields(fieldsStr) {
  const fields = {};
  let i = 0;

  while (i < fieldsStr.length) {
    while (i < fieldsStr.length && /\s/.test(fieldsStr[i])) i++;
    if (i >= fieldsStr.length) break;

    const nameMatch = fieldsStr.slice(i).match(/^(\w+)\s*=\s*/);
    if (!nameMatch) {
      const nextComma = fieldsStr.indexOf(',', i);
      i = nextComma === -1 ? fieldsStr.length : nextComma + 1;
      continue;
    }

    const name = nameMatch[1].toLowerCase();
    i += nameMatch[0].length;

    let value = '';
    if (fieldsStr[i] === '{') {
      const endPos = findMatchingBrace(fieldsStr, i);
      if (endPos === -1) break;
      value = fieldsStr.slice(i + 1, endPos);
      i = endPos + 1;
    } else if (fieldsStr[i] === '"') {
      i++;
      const start = i;
      while (i < fieldsStr.length && fieldsStr[i] !== '"') {
        if (fieldsStr[i] === '\\') i++;
        i++;
      }
      value = fieldsStr.slice(start, i);
      i++;
    } else {
      const start = i;
      while (i < fieldsStr.length && fieldsStr[i] !== ',' && !/\s/.test(fieldsStr[i])) {
        i++;
      }
      value = fieldsStr.slice(start, i);
    }

    fields[name] = value.trim();

    while (i < fieldsStr.length && /\s/.test(fieldsStr[i])) i++;
    if (i < fieldsStr.length && fieldsStr[i] === ',') i++;
  }

  return fields;
}

function mapBibTeXType(type) {
  const typeMap = {
    article: 'article',
    book: 'book',
    inproceedings: 'conference',
    conference: 'conference',
    incollection: 'book',
    phdthesis: 'thesis',
    mastersthesis: 'thesis',
    techreport: 'report',
    misc: 'other',
    unpublished: 'other',
  };
  return typeMap[type] || 'article';
}

function extractBibTeXField(fields, fieldName) {
  const regex = new RegExp(`${fieldName}\\s*=\\s*[{"']([\\s\\S]*?)["}']`, 'i');
  const match = fields.match(regex);
  return match ? match[1].trim() : '';
}

function extractBibTeXAuthors(authorStr) {
  if (!authorStr) return [];
  return authorStr.split(/ and | & /).map(a => a.trim());
}

function extractBibTeXKeywords(keywordStr) {
  if (!keywordStr) return [];
  return keywordStr.split(/[,;]/).map(k => k.trim());
}

module.exports = {
  parseBibTeX,
  mapBibTeXType,
  extractBibTeXField,
  extractBibTeXAuthors,
  extractBibTeXKeywords,
};
