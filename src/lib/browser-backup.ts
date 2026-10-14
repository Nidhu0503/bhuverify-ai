import { z } from 'zod';
import { caseMetadataSchema, documentKindSchema, fieldsSchema } from './demo-validation';
import type { PropertyCase } from './types';

export const BACKUP_BYTES = 8 * 1024 * 1024;
export const BACKUP_VERSION = 'bhuverify-browser-backup/v1';
const id = z.string().regex(/^[a-zA-Z0-9-]+$/).max(100);
const date = z.string().datetime();
const documentSchema = z.object({
  id, name: z.string().min(1).max(180), kind: documentKindSchema,
  mimeType: z.enum(['text/plain', 'application/pdf', 'image/png', 'image/jpeg']),
  size: z.number().int().min(0).max(10 * 1024 * 1024), sha256: z.string().max(128), createdAt: date,
  extraction: z.enum(['demo', 'gemini', 'manual', 'pending', 'failed']), fields: fieldsSchema,
  notes: z.array(z.string().max(600)).max(10), reviewed: z.boolean(),
  originalAvailability: z.enum(['not_retained', 'sample']), error: z.string().max(500).optional(),
}).strict();
export const backupCaseSchema = caseMetadataSchema.extend({
  id, createdAt: date, updatedAt: date, demo: z.boolean(), documents: z.array(documentSchema).max(20),
}).strict();
const backupSchema = z.object({
  schemaVersion: z.literal(BACKUP_VERSION), exportedAt: date,
  cases: z.array(backupCaseSchema).max(12),
}).strict().superRefine((value, context) => {
  if (value.cases.reduce((sum, property) => sum + property.documents.length, 0) > 100) context.addIssue({ code: 'custom', message: 'Too many documents.' });
  if (new Set(value.cases.map(property => property.id)).size !== value.cases.length) context.addIssue({ code: 'custom', message: 'Duplicate cases.' });
  for (const property of value.cases) if (new Set(property.documents.map(document => document.id)).size !== property.documents.length) context.addIssue({ code: 'custom', message: 'Duplicate documents.' });
});

/** Pick only supported fields. Never transmit original bytes, cached analysis, or storage references. */
export function publicCaseSnapshot(property: PropertyCase) {
  const snapshot = {
    id: property.id, title: property.title, state: property.state, district: property.district,
    circle: property.circle, mauza: property.mauza, khata: property.khata, khesra: property.khesra,
    seller: property.seller, purpose: property.purpose, createdAt: property.createdAt,
    updatedAt: property.updatedAt, demo: property.demo, documents: structuredClone(property.documents),
  };
  return { ...snapshot, documents: snapshot.documents.map(({ storageKey: _storageKey, ...document }) => document) };
}
export function serializeBackup(cases: PropertyCase[]) {
  // Backup IDs have a fixed UUID-equivalent length. Replacing them with new UUIDs on
  // import cannot inflate an otherwise valid near-limit backup beyond the byte cap.
  const snapshots = cases.map(property => {
    const snapshot = publicCaseSnapshot(property);
    return { ...snapshot, documents: snapshot.documents.map((document, index) => ({ ...document, id: `backup-document-${String(index).padStart(20, '0')}`, originalAvailability: 'not_retained' as const })) };
  });
  const text = JSON.stringify(backupSchema.parse({ schemaVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), cases: snapshots }), null, 2);
  if (new TextEncoder().encode(text).byteLength > BACKUP_BYTES) throw new Error('This browser workspace exceeds the 8 MB backup-safe storage limit. Your change was not saved. Export a backup and remove unused cases or shorten evidence quotes first.');
  return text;
}
export function parseBackup(text: string, newId: () => string): PropertyCase[] {
  if (new TextEncoder().encode(text).byteLength > BACKUP_BYTES) throw new Error('Backup files must be no larger than 8 MB.');
  const parsed = backupSchema.parse(JSON.parse(text));
  return parsed.cases.map(property => ({
    ...property, id: newId(), ownerId: 'browser-local', updatedAt: new Date().toISOString(), analysis: null,
    documents: property.documents.map(document => ({ ...document, id: newId(), originalAvailability: 'not_retained' as const })),
  }));
}
