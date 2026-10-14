import { describe, expect, it } from 'vitest';
import { analyzeCase, normalizeArea } from '../src/lib/checks';
import { demoDocumentText, demoTemplates } from '../src/lib/demo';
import { BIHAR, getState } from '../src/lib/states';
import type { PropertyCase } from '../src/lib/types';

function sample(id = 'consistent-records'): PropertyCase {
  const source = demoTemplates.find(template => template.id === id)!;
  return { ...structuredClone(source.case), id: 'case-test', ownerId: 'test-user', createdAt: '2026-09-01T09:00:00Z', updatedAt: '2026-09-01T09:00:00Z' };
}

describe('supported area conversions', () => {
  it('compares decimals, acres, square feet and square metres', () => {
    expect(normalizeArea('10', 'decimal')).toBeCloseTo(normalizeArea('4356', 'sqft')!, 6);
    expect(normalizeArea('1', 'acre')).toBeCloseTo(normalizeArea('100', 'decimal')!, 6);
    expect(normalizeArea('1', 'hectare')).toBe(10000);
    expect(normalizeArea('१०', 'डिसमिल')).toBeCloseTo(404.68564224, 6);
    expect(normalizeArea('4,356', 'square feet')).toBeCloseTo(404.68564224, 6);
  });
  it('does not invent local-unit factors or parse ambiguous numeric strings', () => {
    for (const unit of ['katha', 'bigha', 'dhur', 'कट्ठा', '']) expect(normalizeArea('1', unit)).toBeNull();
    for (const value of ['0', '-1', '10 acres', '1,5', 'NaN', '1/2', '', 'Infinity']) expect(normalizeArea(value, 'acre')).toBeNull();
    expect(normalizeArea('9'.repeat(308), 'acre')).toBeNull();
  });
});

describe('evidence-based checks', () => {
  it('never marks even consistent documents officially verified', () => {
    const result = analyzeCase(sample());
    expect(result.officialVerification).toBe('not_performed');
    expect(result.findings.some(f => f.id === 'official-verification' && f.severity === 'unknown')).toBe(true);
    expect(result.findings.some(f => f.severity === 'consistent')).toBe(true);
    expect(result.findings.some(f => f.severity === 'attention')).toBe(false);
    expect(result.coverage).toEqual({ present: 5, expected: 5 });
    expect(result.summary).toContain('Official verification has not been performed');
  });
  it('does not turn missing documents into clearance', () => {
    const propertyCase = sample(); propertyCase.documents = [];
    const result = analyzeCase(propertyCase);
    expect(result.coverage).toEqual({ present: 0, expected: 5 });
    expect(result.findings.filter(f => f.id.startsWith('missing-'))).toHaveLength(5);
    expect(result.findings.every(f => f.severity === 'unknown')).toBe(true);
  });
  it('flags differing plot identifiers within matching geographic scope', () => {
    const result = analyzeCase(sample('plot-mismatch'));
    expect(result.findings.some(f => f.field === 'khesra' && f.severity === 'attention')).toBe(true);
    expect(result.findings.some(f => f.id === 'mortgage-mismatch-mortgage' && f.severity === 'attention')).toBe(true);
  });
  it('does not mistake no release order for no mortgage', () => {
    const result = analyzeCase(sample('plot-mismatch'));
    const mortgage = result.findings.find(f => f.id === 'mortgage-mismatch-mortgage');
    expect(mortgage?.title).toBe('Mortgage wording needs follow-up');
    expect(mortgage?.detail).toContain('no release order');
  });
  it('treats a negative mortgage statement as unknown, never cleared', () => {
    const result = analyzeCase(sample());
    expect(result.findings.find(f => f.id === 'mortgage-consistent-mortgage')?.severity).toBe('unknown');
  });
  it('does not compare identifiers outside their geographic scope', () => {
    const propertyCase = sample('plot-mismatch');
    propertyCase.documents = propertyCase.documents.slice(0, 2);
    propertyCase.documents[1].fields.mauza!.value = 'Another fictional mauza';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('geography-'))).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('identifier-'))).toBe(false);
    expect(result.findings.some(f => f.id.startsWith('area-'))).toBe(false);
  });
  it('requires complete scope rather than assuming the case location is in every file', () => {
    const propertyCase = sample('plot-mismatch');
    propertyCase.documents = propertyCase.documents.slice(0, 2);
    delete propertyCase.documents[1].fields.mauza;
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('scope-'))).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('identifier-'))).toBe(false);
  });
  it('spots when uploaded records agree with each other but differ from the case reference', () => {
    const propertyCase = sample(); propertyCase.khesra = 'DEMO-999';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('case-reference-khesra-') && f.severity === 'review')).toBe(true);
    expect(result.findings.find(f => f.id.startsWith('case-reference-khesra-'))?.detail).toContain('not authoritative');
  });
  it('does not compare a case plot reference across different villages', () => {
    const propertyCase = sample(); propertyCase.mauza = 'Different fictional village'; propertyCase.khesra = 'DEMO-999';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('case-location-'))).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('case-reference-khesra-'))).toBe(false);
  });
  it('treats literal unknown placeholders as missing evidence', () => {
    const propertyCase = sample('plot-mismatch');
    propertyCase.documents = propertyCase.documents.slice(0, 2);
    for (const document of propertyCase.documents) document.fields.mauza!.value = 'Unknown';
    const result = analyzeCase(propertyCase);
    expect(result.findings.filter(f => f.id.startsWith('scope-'))).toHaveLength(2);
    expect(result.findings.some(f => f.id.startsWith('identifier-'))).toBe(false);
  });
  it('allows a previous owner in an earlier Jamabandi without accusing fraud', () => {
    const result = analyzeCase(sample('mutation-pending'));
    const owner = result.findings.find(f => f.id === 'owner-sequence');
    expect(owner?.severity).toBe('review');
    expect(owner?.title).toBe('Jamabandi predates this purchase');
    expect(owner?.detail).toContain('not proof of fraud');
    expect(result.findings.some(f => f.id.startsWith('mutation-pending-'))).toBe(true);
  });
  it('uses the deed buyer, not the historical seller, for the record comparison', () => {
    const result = analyzeCase(sample());
    expect(result.findings.find(f => f.id === 'owner-name-agrees')?.severity).toBe('consistent');
    expect(result.findings.some(f => f.id === 'owner-sequence')).toBe(false);
  });
  it('flags later unexplained owner differences for attention', () => {
    const propertyCase = sample();
    propertyCase.documents.find(d => d.kind === 'jamabandi')!.fields.owner!.value = 'Different Demo';
    expect(analyzeCase(propertyCase).findings.find(f => f.id === 'owner-sequence')?.severity).toBe('attention');
  });
  it('keeps owner sequence uncertain when dates are missing', () => {
    const propertyCase = sample();
    const jamabandi = propertyCase.documents.find(d => d.kind === 'jamabandi')!;
    jamabandi.fields.owner!.value = 'Different Demo'; delete jamabandi.fields.date;
    expect(analyzeCase(propertyCase).findings.find(f => f.id === 'owner-sequence')?.severity).toBe('review');
  });
  it('does not invent order for two transfers with the same date', () => {
    const propertyCase = sample();
    const anotherDeed = structuredClone(propertyCase.documents[0]);
    anotherDeed.id = 'same-day-second-deed'; anotherDeed.sha256 = 'another-file';
    anotherDeed.fields.buyer!.value = 'Different Demo'; propertyCase.documents.push(anotherDeed);
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id === 'chronology-unknown')).toBe(true);
    expect(result.findings.some(f => f.id === 'owner-name-agrees' || f.id === 'owner-sequence')).toBe(false);
  });
  it('does not call a partial-share area difference fraud', () => {
    const propertyCase = sample();
    propertyCase.documents.find(d => d.kind === 'jamabandi')!.fields.area!.value = '8712';
    const discrepancy = analyzeCase(propertyCase).findings.find(f => f.id.startsWith('area-') && !f.id.startsWith('area-agrees'));
    expect(discrepancy?.severity).toBe('review');
    expect(discrepancy?.detail).toContain('only part of a larger holding');
  });
  it('demands review for low-confidence, unreviewed, manual and unread evidence', () => {
    const propertyCase = sample('plot-mismatch');
    propertyCase.documents[0].reviewed = false;
    propertyCase.documents[1].fields.khesra!.confidence = 'low';
    propertyCase.documents[1].extraction = 'manual';
    propertyCase.documents[2].extraction = 'failed';
    const result = analyzeCase(propertyCase);
    expect(result.findings.filter(f => f.id.startsWith('identifier-')).every(f => f.severity === 'review')).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('manual-') && f.severity === 'unknown')).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('unread-') && f.severity === 'unknown')).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('mortgage-'))).toBe(false);
  });
  it('normalizes Devanagari digits and leading zeroes for simple identifiers', () => {
    const propertyCase = sample();
    propertyCase.documents = propertyCase.documents.slice(0, 2);
    propertyCase.documents[0].fields.khesra!.value = '००११८';
    propertyCase.documents[1].fields.khesra!.value = '118';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.field === 'khesra' && f.id.startsWith('identifier-'))).toBe(false);
    expect(result.findings.some(f => f.id.startsWith('area-agrees'))).toBe(true);
  });
  it('leaves multi-plot allocation unknown', () => {
    const propertyCase = sample();
    propertyCase.documents[0].fields.khesra!.value = '118, 119';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('multi-') && f.severity === 'unknown')).toBe(true);
    expect(result.findings.some(f => f.id === 'owner-name-agrees')).toBe(false);
  });
  it('finds empty critical fields and unsupported units', () => {
    const propertyCase = sample();
    delete propertyCase.documents[0].fields.buyer;
    propertyCase.documents[0].fields.areaUnit!.value = 'katha';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('content-') && f.severity === 'unknown')).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('unit-') && f.severity === 'unknown')).toBe(true);
  });
  it('ignores invalid calendar dates and marks future dates for review', () => {
    const propertyCase = sample();
    propertyCase.documents[0].fields.date!.value = '2026-02-30';
    propertyCase.documents[1].fields.date!.value = '2099-01-01';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id.startsWith('date-'))).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('future-'))).toBe(true);
  });
  it('does not run Bihar rules against an unsupported state', () => {
    const propertyCase = sample('plot-mismatch'); propertyCase.state = 'UP';
    const result = analyzeCase(propertyCase);
    expect(result.findings.some(f => f.id === 'unsupported-state')).toBe(true);
    expect(result.findings.some(f => f.id.startsWith('identifier-'))).toBe(false);
    expect(result.officialVerification).toBe('not_performed');
  });
});

describe('Bihar directory and synthetic fixtures', () => {
  it('enables only Bihar and keeps official URLs on government domains', () => {
    expect(getState('BR')).toBe(BIHAR); expect(getState('bihar')).toBe(BIHAR); expect(getState('UP')).toBeUndefined();
    expect(BIHAR.districts).toHaveLength(38);
    for (const service of BIHAR.services) expect(new URL(service.url).hostname).toMatch(/\.bihar\.gov\.in$/);
    for (const guidance of BIHAR.guidance) expect(BIHAR.services.some(service => service.id === guidance.serviceId)).toBe(true);
  });
  it('keeps all fixtures explicit, synthetic and independently serializable', () => {
    expect(demoTemplates).toHaveLength(3);
    for (const template of demoTemplates) {
      expect(template.case.demo).toBe(true);
      for (const doc of template.case.documents) {
        expect(doc.id).toMatch(/^[a-z0-9_-]{1,100}$/);
        expect(doc.extraction).toBe('demo');
        expect(demoDocumentText(doc)).toContain('NOT A GOVERNMENT DOCUMENT');
        expect(Object.values(doc.fields).every(field => field!.quote.startsWith('SYNTHETIC DEMO'))).toBe(true);
      }
      expect(JSON.parse(JSON.stringify(template))).toEqual(template);
    }
  });
});
