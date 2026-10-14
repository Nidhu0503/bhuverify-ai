import { DOCUMENT_LABELS, type Analysis, type DocumentKind, type EvidenceField, type FieldName, type Finding, type PropertyCase, type PropertyDocument } from './types';

const RULE_VERSION = 'bihar-document-checks/1.0.1';
const geography: FieldName[] = ['district', 'circle', 'mauza'];
const digits = (value: string) => value.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966));
const normalize = (value: string) => digits(value).normalize('NFKC').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
const identifier = (value: string) => normalize(value).replace(/^0+(?=\d)/, '');
const field = (doc: PropertyDocument, name: FieldName) => {
  const value = doc.fields[name]?.value.trim();
  if (!value || /^(?:unknown|not available|not extracted|not provided|illegible|unreadable|n\/?a|null|अज्ञात|उपलब्ध नहीं|[-—])$/i.test(value)) return null;
  return value;
};
const same = (a: string, b: string) => normalize(a) === normalize(b);
const usable = (doc: PropertyDocument) => doc.extraction !== 'failed' && doc.extraction !== 'pending';
const confident = (doc: PropertyDocument, names: FieldName[]) => doc.reviewed && names.every(name => doc.fields[name]?.confidence !== 'low');
const isoDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : null;
};

/** Converts only explicitly supported, unambiguous units into square metres. */
export function normalizeArea(value: string, unit: string): number | null {
  const numeric = digits(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(numeric)) return null;
  const amount = Number(numeric.replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const factors: Record<string, number> = {
    sqm: 1, 'sq m': 1, 'sq.m': 1, 'sq.m.': 1, 'square metre': 1, 'square metres': 1,
    'square meter': 1, 'square meters': 1, 'm²': 1, m2: 1, 'वर्ग मीटर': 1,
    sqft: 0.09290304, 'sq ft': 0.09290304, 'sq.ft': 0.09290304, 'sq.ft.': 0.09290304,
    'square foot': 0.09290304, 'square feet': 0.09290304, 'ft²': 0.09290304, 'वर्ग फुट': 0.09290304,
    acre: 4046.8564224, acres: 4046.8564224, 'एकड़': 4046.8564224,
    decimal: 40.468564224, decimals: 40.468564224, dismil: 40.468564224, 'डिसमिल': 40.468564224,
    hectare: 10000, hectares: 10000, ha: 10000, 'हेक्टेयर': 10000,
  };
  const factor = factors[normalize(unit)];
  const converted = factor === undefined ? null : amount * factor;
  return converted !== null && Number.isFinite(converted) ? converted : null;
}

function scope(a: PropertyDocument, b: PropertyDocument): 'same' | 'different' | 'unknown' {
  for (const name of geography) {
    const av = field(a, name), bv = field(b, name);
    if (av && bv && !same(av, bv)) return 'different';
  }
  const at = field(a, 'thana'), bt = field(b, 'thana');
  if (at && bt && identifier(at) !== identifier(bt)) return 'different';
  return geography.every(name => field(a, name) && field(b, name)) ? 'same' : 'unknown';
}

function sameParcel(a: PropertyDocument, b: PropertyDocument) {
  return scope(a, b) === 'same' && (['khata', 'khesra'] as FieldName[]).every(name => {
    const av = field(a, name), bv = field(b, name);
    return av && bv && identifier(av) === identifier(bv) && !/[,;]/.test(av + bv);
  });
}

function newest(docs: PropertyDocument[]): PropertyDocument | undefined {
  if (docs.length === 1) return docs[0];
  if (docs.some(doc => isoDate(field(doc, 'date')) === null)) return undefined;
  const sorted = [...docs].sort((a, b) => (isoDate(field(b, 'date')) ?? 0) - (isoDate(field(a, 'date')) ?? 0));
  // A date alone cannot establish the order of two transfers on the same day.
  if (sorted.length > 1 && field(sorted[0], 'date') === field(sorted[1], 'date')) return undefined;
  return sorted[0];
}

export function analyzeCase(propertyCase: PropertyCase): Analysis {
  const findings: Finding[] = [];
  const add = (id: string, severity: Finding['severity'], title: string, detail: string, action: string, docs: PropertyDocument[] = [], name?: FieldName) => {
    if (findings.some(f => f.id === id)) return;
    findings.push({ id, severity, title, detail, action, documentIds: docs.map(d => d.id), ...(name ? { field: name } : {}) });
  };
  const all = propertyCase.documents;
  const docs = all.filter(usable);
  const expected: DocumentKind[] = propertyCase.purpose === 'purchase'
    ? ['sale_deed', 'jamabandi', 'mutation', 'map', 'encumbrance']
    : propertyCase.purpose === 'mutation' ? ['sale_deed', 'jamabandi', 'mutation'] : ['jamabandi', 'map'];
  const present = expected.filter(kind => docs.some(d => d.kind === kind && Object.keys(d.fields).length > 0));

  if (!['BR', 'BIHAR'].includes(propertyCase.state.trim().toUpperCase())) {
    add('unsupported-state', 'unknown', 'State rules are not available', 'This release supports Bihar only. No state-specific conclusion can be drawn for this case.', 'Choose Bihar or add and review a new state adapter.');
    add('official-verification', 'unknown', 'Official record check is still required', 'BhuVerify has not queried a government record or verified ownership.', 'Obtain the relevant current official records.');
    return { createdAt: new Date().toISOString(), version: RULE_VERSION, findings, summary: 'Unsupported state. No state-specific checks were run; official verification has not been performed.', coverage: { present: 0, expected: 0 }, officialVerification: 'not_performed' };
  }
  add('official-verification', 'unknown', 'Official record check is still required', 'These checks compare supplied documents. BhuVerify has not queried a government record, authenticated a document, or verified ownership, title, possession, disputes, or all encumbrances.', 'Obtain current official records and have an appropriate professional review the complete title chain before a transaction.');
  if (propertyCase.demo) add('synthetic-demo', 'unknown', 'Synthetic example — no real property', 'All people, plots, dates and quoted records in this example are invented for the demonstration.', 'Create your own case to compare documents you are authorised to upload.');

  for (const kind of expected.filter(kind => !present.includes(kind))) {
    const uploaded = all.filter(doc => doc.kind === kind);
    if (uploaded.length) {
      const awaitingFields = uploaded.every(doc => doc.extraction === 'pending' && Object.keys(doc.fields).length === 0);
      add(`unready-${kind}`, 'unknown', `${DOCUMENT_LABELS[kind]} uploaded — ${awaitingFields ? 'fields not entered yet' : 'usable evidence needed'}`, 'An upload is recorded, but no document of this type has usable fields for the comparison yet. It does not count toward document coverage; this is an evidence gap, not a clear result.', 'Open Review fields and enter or review the facts and source quotes from your own original copy. Leave unavailable information blank, then run document checks again.', uploaded);
    } else {
      add(`missing-${kind}`, 'unknown', `${DOCUMENT_LABELS[kind]} is missing`, 'This document is part of the suggested review checklist, not a universal legal requirement. Missing evidence cannot be treated as a clear result.', `Add the relevant ${DOCUMENT_LABELS[kind].toLowerCase()} or record why it is not applicable to this property.`);
    }
  }
  for (const doc of all) {
    if (!usable(doc)) {
      add(`unread-${doc.id}`, 'unknown', `Document not read: ${doc.name}`, doc.extraction === 'failed' ? 'Extraction failed, so this file did not contribute evidence to the comparison.' : 'This file has not been extracted yet and did not contribute evidence to the comparison.', 'Retry extraction or enter and review the fields manually.', [doc]);
      continue;
    }
    const entries = Object.entries(doc.fields) as [FieldName, EvidenceField][];
    if (!doc.reviewed || entries.some(([, evidence]) => evidence.confidence === 'low')) {
      if (doc.extraction === 'manual') {
        add(`review-${doc.id}`, 'review', `${doc.reviewed ? 'Manual review recorded — uncertainty remains' : 'Review manually entered fields'}: ${doc.name}`, doc.reviewed
          ? 'You marked these manually entered or edited fields as reviewed. At least one field is still marked low-confidence; recording your review does not change that rating or independently verify the facts or authenticate the document.'
          : 'These fields were entered or edited manually and have not been marked reviewed. Manual entries can contain mistakes; they are not independently verified.', 'Check uncertain values and their source quotes against your own original copy. Keep unavailable facts unknown and obtain independent verification before relying on them.', [doc]);
      } else {
        add(`review-${doc.id}`, 'review', `Review extracted fields: ${doc.name}`, 'At least one field is low-confidence or this document has not been reviewed. OCR and AI can misread names, numbers and handwritten text.', 'Compare each field with its quoted source before relying on a finding.', [doc]);
      }
    }
    if (doc.extraction === 'manual') add(`manual-${doc.id}`, 'unknown', `Manually entered evidence: ${doc.name}`, 'These fields were entered by a user; marking them reviewed does not authenticate the underlying record.', 'Check the original document and obtain its current official version.', [doc]);
    const requiredByKind: Partial<Record<DocumentKind, FieldName[]>> = { sale_deed: ['buyer', 'seller', 'area'], jamabandi: ['owner', 'area'], mutation: ['mutationStatus'], map: ['boundaries'], encumbrance: ['mortgage'] };
    const missingContent = (requiredByKind[doc.kind] ?? []).filter(name => !field(doc, name));
    if (missingContent.length) add(`content-${doc.id}`, 'unknown', `Important fields are missing: ${doc.name}`, `Not available in the extracted evidence: ${missingContent.join(', ')}. The presence of a file does not mean its contents are complete.`, 'Review the original; leave genuinely unavailable fields unknown rather than guessing.', [doc]);
    const missingScope = [...geography, 'khata', 'khesra' as FieldName].filter(name => !field(doc, name as FieldName));
    if (missingScope.length) add(`scope-${doc.id}`, 'unknown', `Parcel identity is incomplete: ${doc.name}`, `Missing: ${missingScope.join(', ')}. A plot number is not unique across Bihar.`, 'Add district, anchal, mauza, khata and khesra from this document; do not infer them from another file.', [doc]);
    const caseLocation = (name: FieldName) => propertyCase[name as 'district' | 'circle' | 'mauza'].trim();
    const caseScopeDiffers = geography.some(name => caseLocation(name) && field(doc, name) && !same(caseLocation(name), field(doc, name)!));
    if (caseScopeDiffers) add(`case-location-${doc.id}`, 'review', `Case location differs from ${doc.name}`, 'The location entered for this case does not match the district, anchal or mauza text in this document. Case details are user-entered references, not official evidence.', 'Check whether the file belongs to this property and correct the case reference or extracted location if needed.', [doc]);
    else if (geography.every(name => caseLocation(name) && field(doc, name))) {
      for (const name of ['khata', 'khesra'] as const) {
        const reference = propertyCase[name].trim(), recorded = field(doc, name);
        if (reference && recorded && !/[,;]/.test(reference + recorded) && identifier(reference) !== identifier(recorded)) add(`case-reference-${name}-${doc.id}`, 'review', `Case ${name} differs from the document`, `The case reference is “${reference}”; ${doc.name} records “${recorded}”. The case reference itself is not authoritative evidence.`, 'Check that the correct document is attached and correct the case reference or extracted field when justified by the original.', [doc], name);
      }
    }
    if (field(doc, 'khesra') && /[,;]/.test(field(doc, 'khesra')!)) add(`multi-${doc.id}`, 'unknown', 'Multiple plots require separate review', 'This document lists several plot numbers. The first release cannot safely allocate area or ownership between plots.', 'Create a case per plot and review the exact schedule and share in the original document.', [doc], 'khesra');
    const dateText = field(doc, 'date');
    const date = isoDate(dateText);
    if (!dateText || date === null) add(`date-${doc.id}`, 'unknown', `Document date needs checking: ${doc.name}`, 'A valid, unambiguous document date is needed to place records in sequence.', 'Review the source date and enter it as YYYY-MM-DD.', [doc], 'date');
    else if (date > Date.now()) add(`future-${doc.id}`, 'review', `Future document date: ${doc.name}`, `The extracted date ${dateText} is after today. It may be a reading or entry error.`, 'Check the original document date.', [doc], 'date');
    const mutationStatus = field(doc, 'mutationStatus');
    if (doc.kind === 'mutation' && mutationStatus && /pending|under review|submitted|लंबित|प्रक्रियाधीन/i.test(mutationStatus)) add(`mutation-pending-${doc.id}`, 'review', 'Mutation outcome is still pending in this document', `The supplied document states “${mutationStatus}”. An acknowledgement is not a final mutation order, and the live status may have changed.`, 'Check the official application status and obtain the final order and updated Jamabandi when available.', [doc], 'mutationStatus');
    const amount = field(doc, 'area'), unit = field(doc, 'areaUnit');
    if (amount && (!unit || normalizeArea(amount, unit) === null)) add(`unit-${doc.id}`, 'unknown', 'Area needs a verified unit conversion', `${doc.name} records ${amount}${unit ? ` ${unit}` : ' with no unit'}. Local units such as katha, bigha and dhur are not converted automatically.`, 'Confirm the local measurement standard with the survey or revenue authority and use a documented conversion.', [doc], 'areaUnit');
    const mortgage = field(doc, 'mortgage');
    if (mortgage) {
      const text = normalize(mortgage).replace(/[.!।]+$/, '');
      // Negative statements are accepted only as narrow textual assertions, never as clearance.
      const negative = /^(?:none|nil|no|not recorded|no mortgage(?: recorded)?|no encumbrance(?: recorded)?|no charge(?: recorded)?|कोई बंधक नहीं|बंधक नहीं|नहीं)$/.test(text);
      add(`mortgage-${doc.id}`, negative ? 'unknown' : confident(doc, ['mortgage']) ? 'attention' : 'review', negative ? 'A document reports no mortgage' : 'Mortgage wording needs follow-up', negative
        ? `The supplied document says “${mortgage}”. This does not establish the absence of other or later charges, unregistered claims, or disputes.`
        : `The supplied document says “${mortgage}”. BhuVerify cannot determine whether a charge remains effective or has been released.`, 'Check Bihar’s mortgage information and obtain lender release evidence where relevant; seek a complete professional encumbrance review.', [doc], 'mortgage');
    }
  }

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i], b = docs[j], pair = `${a.id}-${b.id}`;
      if (a.sha256 && a.sha256 === b.sha256) add(`duplicate-${pair}`, 'review', 'The same file was added twice', `${a.name} and ${b.name} have identical file fingerprints. This is duplicate evidence, not independent corroboration.`, 'Keep the appropriate copy and obtain an independent source if needed.', [a, b]);
      const location = scope(a, b);
      if (location === 'different') {
        add(`geography-${pair}`, 'review', 'Documents may refer to different locations', `${a.name} and ${b.name} differ in district, anchal, mauza or thana. Their plot numbers and areas were not compared as the same parcel.`, 'Check spelling, transliteration, administrative changes and the full village/survey identity.', [a, b]);
        continue;
      }
      if (location !== 'same') continue;
      for (const name of ['khata', 'khesra'] as FieldName[]) {
        const av = field(a, name), bv = field(b, name);
        if (!av || !bv || /[,;]/.test(av + bv)) continue;
        if (identifier(av) !== identifier(bv)) add(`identifier-${name}-${pair}`, confident(a, [name, ...geography]) && confident(b, [name, ...geography]) ? 'attention' : 'review', `${name === 'khesra' ? 'Khesra / plot' : 'Khata'} numbers differ`, `${a.name} records “${av}”; ${b.name} records “${bv}” within matching district, anchal and mauza text. Different surveys, subdivision or a reading error may explain the difference.`, 'Compare the schedules and survey identifiers with current official records before proceeding.', [a, b], name);
      }
      if (!sameParcel(a, b)) continue;
      const areaA = field(a, 'area'), areaB = field(b, 'area'), unitA = field(a, 'areaUnit'), unitB = field(b, 'areaUnit');
      if (areaA && areaB && unitA && unitB) {
        const valueA = normalizeArea(areaA, unitA), valueB = normalizeArea(areaB, unitB);
        if (valueA !== null && valueB !== null) {
          const difference = Math.abs(valueA - valueB) / Math.max(valueA, valueB);
          if (difference > 0.005) add(`area-${pair}`, 'review', 'Recorded areas differ', `${a.name}: ${areaA} ${unitA}; ${b.name}: ${areaB} ${unitB}. The normalized figures differ by approximately ${(difference * 100).toFixed(1)}%. A deed can transfer only part of a larger holding.`, 'Check whether both values describe the same plot, share and survey; request measurement if necessary.', [a, b], 'area');
          else if (confident(a, ['area', 'areaUnit', ...geography, 'khata', 'khesra']) && confident(b, ['area', 'areaUnit', ...geography, 'khata', 'khesra'])) add(`area-agrees-${pair}`, 'consistent', 'These recorded areas agree', `${areaA} ${unitA} and ${areaB} ${unitB} are within 0.5% after supported-unit conversion. This is a numerical comparison, not a survey or title confirmation.`, 'Confirm the transferred share and physical boundaries independently.', [a, b], 'area');
        }
      }
      const boundA = field(a, 'boundaries'), boundB = field(b, 'boundaries');
      if (boundA && boundB && !same(boundA, boundB)) add(`boundaries-${pair}`, 'review', 'Boundary descriptions need comparison', 'Boundary wording differs between documents. Abbreviations, changed neighbours or a different schedule may explain this.', 'Review each direction in the original schedule and the official map; a physical survey may be needed.', [a, b], 'boundaries');
    }
  }

  const deeds = docs.filter(d => d.kind === 'sale_deed');
  const records = docs.filter(d => d.kind === 'jamabandi');
  const deed = newest(deeds), record = newest(records);
  if ((deeds.length > 1 && !deed) || (records.length > 1 && !record)) add('chronology-unknown', 'unknown', 'Document sequence is unclear', 'Multiple deeds or Jamabandi documents have missing, invalid or tied latest dates. The latest owner entry could not be selected safely.', 'Review every date and the complete transfer chain.');
  if (deed && record && sameParcel(deed, record)) {
    const buyer = field(deed, 'buyer'), owner = field(record, 'owner');
    const deedDate = isoDate(field(deed, 'date')), recordDate = isoDate(field(record, 'date'));
    const pending = docs.some(d => d.kind === 'mutation' && sameParcel(deed, d) && /pending|under review|submitted|लंबित|प्रक्रियाधीन/i.test(field(d, 'mutationStatus') ?? ''));
    if (!buyer || !owner) add('owner-missing', 'unknown', 'Owner comparison needs more evidence', 'The deed buyer or Jamabandi recorded owner has not been extracted.', 'Review the names and capacities in the source documents.', [deed, record], 'owner');
    else if (!same(buyer, owner)) {
      const historical = deedDate !== null && recordDate !== null && recordDate < deedDate;
      const chronologyKnown = deedDate !== null && recordDate !== null;
      add('owner-sequence', historical || pending || !chronologyKnown || !confident(deed, ['buyer']) || !confident(record, ['owner']) ? 'review' : 'attention', historical ? 'Jamabandi predates this purchase' : pending ? 'Buyer name is not yet reflected in this record' : 'Buyer and recorded owner names differ', `The deed names buyer “${buyer}”; Jamabandi names “${owner}”. ${historical ? 'The Jamabandi date is earlier than the deed, so the previous owner may still appear.' : pending ? 'The supplied mutation document says the application is pending.' : !chronologyKnown ? 'Dates are insufficient to establish their sequence.' : 'Spelling, joint ownership, the transfer chain or a later change may explain this.'} This difference is not proof of fraud.`, historical || pending ? 'Obtain current Jamabandi and check the mutation application and final order on Bihar Bhumi.' : 'Ask for the complete title chain, current Jamabandi and mutation order; have the identities and legal interests reviewed.', [deed, record], 'owner');
    } else if (confident(deed, ['buyer']) && confident(record, ['owner'])) add('owner-name-agrees', 'consistent', 'Buyer and recorded-owner text agree', `Both supplied documents use “${buyer}”. A matching name does not establish identity or legal ownership.`, 'Confirm identity, capacity, all co-owners and the complete title chain.', [deed, record], 'owner');
  }

  const order = { attention: 0, review: 1, unknown: 2, consistent: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const attention = findings.filter(f => f.severity === 'attention').length;
  const review = findings.filter(f => f.severity === 'review').length;
  const unknown = findings.filter(f => f.severity === 'unknown').length;
  return {
    createdAt: new Date().toISOString(), version: RULE_VERSION, findings,
    summary: `${attention} issue${attention === 1 ? '' : 's'} needing attention · ${review} review item${review === 1 ? '' : 's'} · ${unknown} evidence gap${unknown === 1 ? '' : 's'}. Official verification has not been performed.`,
    coverage: { present: present.length, expected: expected.length }, officialVerification: 'not_performed',
  };
}
