import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('CitationWhitelist', () => {
  it('can be instantiated', () => {
    const { CitationWhitelist } = require('../engine/quality/citation-whitelist');
    const wl = new CitationWhitelist('/tmp/test-wl-vitest');
    expect(wl.importBibTeX).toBeDefined();
    expect(wl.getAll).toBeDefined();
    expect(wl.verifyCitation).toBeDefined();
    expect(wl.formatForPrompt).toBeDefined();
  });

  it('parses BibTeX and verifies citations', () => {
    const { CitationWhitelist } = require('../engine/quality/citation-whitelist');
    const tmpDir = path.join(ROOT, 'papers', `test-wl-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const wl = new CitationWhitelist(tmpDir);
      const bibtex = `@article{smith2023,
  title={Test Paper},
  author={Smith, John},
  year={2023},
  journal={Test Journal}
}`;
      const result = wl.importBibTeXContent(bibtex);
      expect(result.success).toBe(true);
      expect(result.added).toBe(1);

      const entries = wl.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].id || entries[0].key).toBe('smith2023');

      // Valid citation
      const v1 = wl.verifyCitation('This is supported by [1].');
      expect(v1.valid).toBe(true);

      // Invalid citation
      const v2 = wl.verifyCitation('This is supported by [99].');
      expect(v2.valid).toBe(false);
      expect(v2.issues).toHaveLength(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('QualityReport', () => {
  it('generates a report from blackboard data', () => {
    const { QualityReport } = require('../engine/quality/quality-report');
    const report = new QualityReport(path.join(ROOT, 'papers', 'test-qr'));
    report.collectFromBlackboard({
      topic: 'Test Topic',
      draft: {
        full: 'This is a test paper with [1] and [2] references. ' + 'Word '.repeat(100),
        chapters: [{}, {}],
      },
      review: { report: 'Round 1 Score: 75/100' },
    });
    const md = report.generate();
    expect(md).toContain('质量报告');
    expect(md).toContain('Test Topic');
  });

  it('reports missing citations', () => {
    const { QualityReport } = require('../engine/quality/quality-report');
    const report = new QualityReport(path.join(ROOT, 'papers', 'test-qr2'));
    report.collectFromBlackboard({
      topic: 'No Citations',
      draft: { full: 'Paper with no citations at all. ' + 'Word '.repeat(100), chapters: [] },
    });
    const md = report.generate();
    expect(md).toContain('未检测到引用');
  });
});
