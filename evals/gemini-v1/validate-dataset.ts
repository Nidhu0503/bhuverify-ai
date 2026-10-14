/**
 * Offline fixture validation; never loads .env, calls Gemini, or changes files.
 * Run from the repo:
 * node --experimental-strip-types --experimental-default-type=module evals/gemini-v1/validate-dataset.ts
 * Uses the already-installed TypeScript compiler to load the real app rules in
 * memory, without changing application module settings or installing a runner.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { Analysis, DocumentKind, FieldName, Finding, PropertyCase, PropertyDocument } from '../../src/lib/types';

type GoldField = { value: string; page: number; quote: string };
type RuleExpectation = {
  required: { idPrefix: string; severity: Finding['severity'] }[];
  forbiddenPrefixes: string[];
};
type FixtureDocument = {
  id: string; filename: string; kind: DocumentKind;
  language: 'en' | 'hi' | 'mixed'; format: 'pdf' | 'txt' | 'png' | 'jpeg';
  layout: 'form' | 'narrative'; quality: 'clear' | 'mild-blur' | 'masked' | 'severe';
  pages: { heading: string; lines: string[] }[];
  expectedFields: Partial<Record<FieldName, GoldField>>;
  unreadableFields: FieldName[]; notes: string[];
};
type FixtureCase = {
  id: string; title: string; description: string; category: string;
  split: 'development' | 'holdout';
  caseMetadata: Pick<PropertyCase, 'state' | 'district' | 'circle' | 'mauza' | 'khata' | 'khesra' | 'seller' | 'purpose'>;
  documents: FixtureDocument[]; expectedBehavior: string[]; mustNotClaim: string[];
  assistantQuestion: string; assistantMustMention: string[];
  checks: { unreviewed: RuleExpectation; reviewed: RuleExpectation };
};
type Dataset = { version: string; created: string; cases: FixtureCase[] };

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(fixtureRoot, '../..');
const transpile = (name: string) => ts.transpileModule(
  readFileSync(resolve(repoRoot, 'src/lib', name + '.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const typeExports: Record<string, unknown> = {};
runInNewContext(transpile('types'), { exports: typeExports });
const resolveLocal = (name: string) => {
  assert.equal(name, './types', 'Only the known pure types module may be imported');
  return typeExports;
};
const stateExports: Record<string, unknown> = {};
runInNewContext(transpile('states'), { exports: stateExports, require: resolveLocal });
const districts = new Set((stateExports.BIHAR as { districts: string[] }).districts);
const ruleExports: Record<string, unknown> = {};
runInNewContext(transpile('checks'), { exports: ruleExports, require: resolveLocal, Date });
const analyzeCase = ruleExports.analyzeCase as (propertyCase: PropertyCase) => Analysis;
assert.equal(typeof analyzeCase, 'function');
const validFields = new Set(Object.keys(typeExports.FIELD_LABELS as object));
const dataset = JSON.parse(readFileSync(resolve(fixtureRoot, 'dataset.json'), 'utf8')) as Dataset;
assert.equal(dataset.version, 'bhuverify-gemini-eval/v1');
assert.equal(dataset.created, '2026-10-09');
assert.equal(dataset.cases.length, 15);
const holdout = new Set(['BV03', 'BV06', 'BV09', 'BV12', 'BV15']);
const categories = new Map<string, number>();
const formats = new Map<string, number>();
const documentIds = new Set<string>();
const filenames = new Set<string>();
let goldFields = 0;
let unreadableFields = 0;
let ruleAssertions = 0;

for (const [index, fixture] of dataset.cases.entries()) {
  const id = 'BV' + String(index + 1).padStart(2, '0');
  assert.equal(fixture.id, id);
  assert.equal(fixture.split, holdout.has(id) ? 'holdout' : 'development');
  assert.equal(fixture.caseMetadata.state, 'BR');
  assert.equal(fixture.caseMetadata.purpose, 'purchase');
  assert(districts.has(fixture.caseMetadata.district), id + ': unsupported UI district');
  assert(/Demo|डेमो/.test(fixture.caseMetadata.mauza), id + ': village must be fictional');
  assert(/Demo$|डेमो$/.test(fixture.caseMetadata.seller), id + ': seller must be fictional');
  categories.set(fixture.category, (categories.get(fixture.category) ?? 0) + 1);
  assert.equal(fixture.documents.length, id === 'BV09' ? 1 : id === 'BV12' ? 3 : 2);
  for (const name of ['title', 'description', 'assistantQuestion'] as const) assert(fixture[name].trim());
  for (const name of ['expectedBehavior', 'mustNotClaim', 'assistantMustMention'] as const) {
    assert(fixture[name].length > 0);
    assert(fixture[name].every(value => typeof value === 'string' && value.trim()));
  }

  for (const [docIndex, doc] of fixture.documents.entries()) {
    assert.equal(doc.id, id + '-D' + (docIndex + 1));
    assert(!documentIds.has(doc.id), 'Duplicate document ID');
    documentIds.add(doc.id);
    assert.equal(basename(doc.filename), doc.filename, 'Filename must not escape the case folder');
    assert(!filenames.has(doc.filename), 'Duplicate filename');
    filenames.add(doc.filename);
    assert(['sale_deed', 'jamabandi', 'mutation'].includes(doc.kind));
    assert(['pdf', 'txt', 'png', 'jpeg'].includes(doc.format));
    assert(doc.filename.endsWith('.' + (doc.format === 'jpeg' ? 'jpg' : doc.format)));
    assert(['en', 'hi', 'mixed'].includes(doc.language));
    assert(['clear', 'mild-blur', 'masked', 'severe'].includes(doc.quality));
    assert(['form', 'narrative'].includes(doc.layout));
    formats.set(doc.format, (formats.get(doc.format) ?? 0) + 1);
    assert(doc.pages.length > 0);
    for (const page of doc.pages) {
      assert(page.heading.trim());
      assert(page.lines.length > 0 && page.lines.every(line => typeof line === 'string' && line.trim()));
    }
    assert.equal(new Set(doc.unreadableFields).size, doc.unreadableFields.length);
    const source = doc.pages.flatMap(page => page.lines).join('\n');
    assert.equal((source.match(/\[unreadable\]|\[अस्पष्ट\]/g) ?? []).length, doc.unreadableFields.length);
    for (const field of doc.unreadableFields) {
      assert(validFields.has(field), doc.id + ': invalid unreadable field ' + field);
      assert(!(field in doc.expectedFields), doc.id + ': unreadable field cannot have a gold value');
      unreadableFields++;
    }
    for (const [name, evidence] of Object.entries(doc.expectedFields)) {
      assert(validFields.has(name), doc.id + ': unknown field ' + name);
      assert(typeof evidence.value === 'string' && evidence.value.trim());
      assert(Number.isInteger(evidence.page) && evidence.page >= 1 && evidence.page <= doc.pages.length);
      assert(evidence.quote.trim() && doc.pages[evidence.page - 1].lines.some(line => line.includes(evidence.quote)), doc.id + '.' + name + ': quote/page does not match source');
      assert(evidence.quote.includes(evidence.value), doc.id + '.' + name + ': original value not present in quote');
      assert(!/unreadable|\[अस्पष्ट\]/i.test(evidence.value));
      if (['owner', 'buyer', 'seller'].includes(name)) assert(/Demo$|डेमो$/.test(evidence.value));
      if (name === 'date') {
        assert(/^\d{4}-\d{2}-\d{2}$/.test(evidence.value));
        const date = new Date(evidence.value + 'T00:00:00Z');
        assert(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === evidence.value);
        assert(evidence.value < dataset.created, doc.id + ': future source date');
      }
      goldFields++;
    }
  }

  for (const mode of ['unreviewed', 'reviewed'] as const) {
    // High confidence here describes authored gold, not any model prediction.
    const documents: PropertyDocument[] = fixture.documents.map(doc => ({
      id: doc.id, name: doc.filename, kind: doc.kind,
      mimeType: doc.format === 'pdf' ? 'application/pdf' : doc.format === 'txt' ? 'text/plain' : 'image/' + doc.format,
      size: 0, sha256: 'distinct-gold-source-' + doc.id,
      createdAt: dataset.created + 'T00:00:00Z', extraction: 'gemini',
      fields: Object.fromEntries(Object.entries(doc.expectedFields).map(([name, evidence]) => [name, { ...evidence, confidence: 'high' }])),
      notes: [], reviewed: mode === 'reviewed',
    }));
    const result = analyzeCase({
      id, ownerId: 'offline-evaluation', title: fixture.title, ...fixture.caseMetadata,
      createdAt: dataset.created + 'T00:00:00Z', updatedAt: dataset.created + 'T00:00:00Z',
      // A fresh UI-created case is not one of the app's prefilled demos.
      demo: false, documents, analysis: null,
    });
    assert.equal(result.officialVerification, 'not_performed');
    const expected = fixture.checks[mode];
    for (const requirement of expected.required) {
      assert(result.findings.some(finding => finding.id.startsWith(requirement.idPrefix) && finding.severity === requirement.severity), id + ' ' + mode + ': missing ' + JSON.stringify(requirement));
      ruleAssertions++;
    }
    for (const prefix of expected.forbiddenPrefixes) {
      assert(!result.findings.some(finding => finding.id.startsWith(prefix)), id + ' ' + mode + ': forbidden ' + prefix);
      ruleAssertions++;
    }
  }
}
assert.equal(documentIds.size, 30);
assert.equal(goldFields, 282);
assert.equal(unreadableFields, 12);
assert.equal(categories.size, 5);
for (const category of ['matching', 'conflict', 'missing', 'language', 'scan_quality']) assert.equal(categories.get(category), 3);
console.log(JSON.stringify({
  result: 'PASS', offlineOnly: true, cases: dataset.cases.length,
  documents: documentIds.size, goldFields, unreadableFields,
  development: 10, holdout: holdout.size, formats: Object.fromEntries(formats),
  reviewModes: 2, ruleAssertions,
  note: 'This validates fixtures and deterministic rules, not Gemini accuracy or document rendering.',
}, null, 2));
