import type { DocumentKind, EvidenceField, ExtractedFields, FieldName, PropertyCase, PropertyDocument } from './types';

const timestamp = '2026-09-01T09:00:00.000Z';
const evidence = (value: string, quote: string, page = 1): EvidenceField => ({ value, quote, page, confidence: 'high' });
const makeFields = (values: Partial<Record<FieldName, string>>): ExtractedFields => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, evidence(value, `SYNTHETIC DEMO — ${key}: ${value}`)]));
const location = { district: 'Patna', circle: 'Bihta', mauza: 'Demo Nagar (fictional)', thana: '9999', khata: 'DEMO-42', khesra: 'DEMO-118' };
const document = (id: string, name: string, kind: DocumentKind, values: Partial<Record<FieldName, string>>, notes: string[] = []): PropertyDocument => ({ id, name, kind, mimeType: 'text/plain', size: 0, sha256: `synthetic-${id}`, createdAt: timestamp, extraction: 'demo', fields: makeFields(values), notes: ['Wholly synthetic demonstration text. Not issued by any authority.', ...notes], reviewed: true });

type DemoCase = Omit<PropertyCase, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;
export type DemoTemplate = { id: string; title: string; description: string; case: DemoCase };
const base: Omit<DemoCase, 'title' | 'documents'> = { state: 'BR', ...location, seller: 'Asha Demo', purpose: 'purchase', demo: true, analysis: null };

export const demoTemplates: DemoTemplate[] = [
  {
    id: 'plot-mismatch', title: 'Two papers. Two plot numbers.', description: 'A seller’s deed and revenue record disagree, and a mortgage entry needs follow-up.',
    case: { ...base, title: 'Bihta · plot-number discrepancy', documents: [
      document('mismatch-deed', 'DEMO · Sale deed.txt', 'sale_deed', { ...location, seller: 'Dev Demo', buyer: 'Asha Demo', area: '12', areaUnit: 'decimal', date: '2024-05-14', boundaries: 'North: demo lane; South: demonstration field; East: plot DEMO-119; West: demo canal' }),
      document('mismatch-jamabandi', 'DEMO · Jamabandi.txt', 'jamabandi', { ...location, khesra: 'DEMO-181', owner: 'Asha Demo', jamabandi: 'DEMO-2024-008', area: '12', areaUnit: 'decimal', date: '2026-08-10' }),
      document('mismatch-mortgage', 'DEMO · Mortgage record.txt', 'encumbrance', { ...location, owner: 'Asha Demo', date: '2026-08-12', mortgage: 'Mortgage entry in favour of Fictional Cooperative Bank; no release order is included.' }),
    ] },
  },
  {
    id: 'mutation-pending', title: 'Purchase done. Mutation pending.', description: 'The older Jamabandi still names the previous holder. Follow the document timeline.',
    case: { ...base, title: 'Bihta · mutation follow-up', purpose: 'mutation', seller: 'Meera Demo', documents: [
      document('pending-deed', 'DEMO · New sale deed.txt', 'sale_deed', { ...location, seller: 'Meera Demo', buyer: 'Ravi Demo', area: '8', areaUnit: 'decimal', date: '2026-07-10' }),
      document('pending-jamabandi', 'DEMO · Earlier Jamabandi.txt', 'jamabandi', { ...location, owner: 'Meera Demo', jamabandi: 'DEMO-2020-041', area: '8', areaUnit: 'decimal', date: '2026-06-15' }),
      document('pending-mutation', 'DEMO · Mutation acknowledgement.txt', 'mutation', { ...location, buyer: 'Ravi Demo', date: '2026-07-13', mutationStatus: 'Pending — application submitted; final order not issued.' }),
    ] },
  },
  {
    id: 'consistent-records', title: 'Documents agree. Checks remain.', description: 'Compare equivalent area units and matching names without treating agreement as a title guarantee.',
    case: { ...base, title: 'Bihta · document comparison', documents: [
      document('consistent-deed', 'DEMO · Sale deed.txt', 'sale_deed', { ...location, seller: 'Dev Demo', buyer: 'Asha Demo', area: '10', areaUnit: 'decimal', date: '2024-05-14', boundaries: 'North: demo road; South: demo field; East: DEMO-119; West: demo canal' }),
      document('consistent-jamabandi', 'DEMO · Jamabandi.txt', 'jamabandi', { ...location, owner: 'Asha Demo', jamabandi: 'DEMO-2024-008', area: '4356', areaUnit: 'sqft', date: '2026-08-10' }),
      document('consistent-mutation', 'DEMO · Mutation order.txt', 'mutation', { ...location, owner: 'Asha Demo', date: '2024-08-20', mutationStatus: 'Disposed — example order records a revenue-entry update.' }),
      document('consistent-map', 'DEMO · Map schedule.txt', 'map', { ...location, area: '10', areaUnit: 'decimal', date: '2026-08-10', boundaries: 'North: demo road; South: demo field; East: DEMO-119; West: demo canal' }, ['Text-only example map schedule; no actual cadastral drawing.']),
      document('consistent-mortgage', 'DEMO · Mortgage statement.txt', 'encumbrance', { ...location, owner: 'Asha Demo', date: '2026-08-12', mortgage: 'No mortgage recorded' }),
    ] },
  },
];

/** Synthetic source preview only. Never reconstruct an uploaded original from extracted fields. */
export function demoDocumentText(doc: PropertyDocument): string {
  return ['BHUVERIFY — SYNTHETIC DEMONSTRATION ONLY', 'NOT A GOVERNMENT DOCUMENT. NO REAL PERSON OR PROPERTY.', '', doc.name, '', ...Object.values(doc.fields).filter(Boolean).map(f => f!.quote), '', ...doc.notes].join('\n');
}
