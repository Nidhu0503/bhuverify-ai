import { describe, expect, it } from 'vitest';
import { citationFreshness, distinctAssistantSources, getInlineCitationIds, parseInlineCitations } from '../src/lib/assistant-citations';
import { demoTemplates } from '../src/lib/demo';
import type { AssistantSource } from '../src/lib/types';

const documents = demoTemplates[2].case.documents;
const document = documents[0];
const source: AssistantSource = { id: 43, documentId: document.id, documentName: document.name, field: 'khata', ...document.fields.khata! };

describe('assistant citation markers', () => {
  it('preserves sparse and out-of-order IDs and splits grouped markers', () => {
    expect(getInlineCitationIds('Same plot [43, 1]. Area [11][43].')).toEqual([43, 1, 11]);
    expect(parseInlineCitations('खाता [43, 1].')).toEqual([
      { kind: 'text', text: 'खाता ' },
      { kind: 'citation', text: '[43, 1]', ids: [43, 1] },
      { kind: 'text', text: '.' },
    ]);
  });
  it('leaves unsupported markup as text and does not parse HTML', () => {
    const text = '<img src=x onerror=alert(1)> **text** [name] [1-3] [-1]';
    expect(parseInlineCitations(text)).toEqual([{ kind: 'text', text }]);
  });
  it('retains zero and unknown IDs so server validation can reject them', () => {
    expect(getInlineCitationIds('[0] [999]')).toEqual([0, 999]);
  });
  it('does not silently discard unsafe numeric identifiers', () => {
    const ids = getInlineCitationIds('[9007199254740992]');
    expect(ids).toHaveLength(1);
    expect(Number.isSafeInteger(ids[0])).toBe(false);
  });
  it('deduplicates repeated IDs without renumbering', () => {
    expect(getInlineCitationIds('[11,11,1] [11]')).toEqual([11, 1]);
    expect(distinctAssistantSources([source, { ...source }, { ...source, id: 1, field: 'area' }]).map(item => item.id)).toEqual([43, 1]);
  });
  it('does not invent IDs for an empty or unnumbered answer', () => {
    expect(parseInlineCitations('')).toEqual([]);
    expect(getInlineCitationIds('The document describes this plot.')).toEqual([]);
    expect(distinctAssistantSources([{ ...source, id: 0 }])).toEqual([]);
  });
});

describe('response-time evidence snapshots', () => {
  it('recognizes a still-current field', () => expect(citationFreshness(source, documents)).toBe('current'));
  it('recognizes a removed document without changing the saved snapshot', () => {
    const before = structuredClone(source);
    expect(citationFreshness(source, [])).toBe('missing');
    expect(source).toEqual(before);
  });
  for (const key of ['value', 'quote', 'page'] as const) {
    it(`warns when the cited ${key} changes`, () => {
      const changed = structuredClone(documents);
      Object.assign(changed[0].fields.khata!, { [key]: key === 'page' ? null : 'changed' });
      expect(citationFreshness(source, changed)).toBe('changed');
    });
  }
  it('warns when a field is removed or the source is renamed', () => {
    const changed = structuredClone(documents);
    delete changed[0].fields.khata;
    expect(citationFreshness(source, changed)).toBe('changed');
    expect(citationFreshness(source, [{ ...document, name: 'Renamed.txt' }])).toBe('changed');
  });
  it('does not call unrelated field changes a changed citation', () => {
    const changed = structuredClone(documents);
    changed[0].fields.area!.value = '999';
    expect(citationFreshness(source, changed)).toBe('current');
  });
  it.each(['failed', 'pending'] as const)('warns when extraction is now %s even if field text is unchanged', extraction => {
    expect(citationFreshness(source, [{ ...document, extraction }])).toBe('changed');
  });
});
