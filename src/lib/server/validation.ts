import { z } from 'zod';
import { FIELD_LABELS } from '../types';

export const documentKindSchema = z.enum(['sale_deed', 'jamabandi', 'mutation', 'lagaan', 'map', 'encumbrance', 'other']);
export const evidenceSchema = z.object({
  value: z.string().trim().min(1).max(1000),
  page: z.number().int().min(1).max(1000).nullable(),
  quote: z.string().max(2000),
  confidence: z.enum(['high', 'medium', 'low']),
}).strict();
export const fieldsSchema = z.record(z.enum(Object.keys(FIELD_LABELS) as [keyof typeof FIELD_LABELS, ...(keyof typeof FIELD_LABELS)[]]), evidenceSchema);
const shortText = z.string().trim().max(160);
export const caseMetadataSchema = z.object({
  title: z.string().trim().min(1).max(120),
  state: z.literal('BR'),
  district: shortText.default(''),
  circle: shortText.default(''),
  mauza: shortText.default(''),
  khata: shortText.default(''),
  khesra: shortText.default(''),
  seller: shortText.default(''),
  purpose: z.enum(['purchase', 'mutation', 'records']).default('purchase'),
}).strict();
export const createCaseSchema = z.union([z.object({ demoId: z.string().min(1).max(80) }).strict(), caseMetadataSchema]);
export const patchCaseSchema = z.union([
  z.object({ documentId: z.string().min(1).max(100), fields: fieldsSchema, reviewed: z.literal(true) }).strict(),
  caseMetadataSchema.partial().refine(value => Object.keys(value).length > 0, 'Supply at least one editable field.'),
]);
export const questionSchema = z.object({ question: z.string().trim().min(3).max(2000) }).strict();

const snapshotId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const timestamp = z.string().datetime({ offset: true });
const snapshotDocumentSchema = z.object({
  id: snapshotId,
  name: z.string().min(1).max(180),
  kind: documentKindSchema,
  mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']),
  size: z.number().int().min(0).max(10 * 1024 * 1024),
  sha256: z.string().max(180),
  createdAt: timestamp,
  extraction: z.enum(['demo', 'gemini', 'manual', 'pending', 'failed']),
  fields: fieldsSchema,
  notes: z.array(z.string().max(600)).max(10),
  reviewed: z.boolean(),
  originalAvailability: z.enum(['not_retained', 'sample']).optional(),
  error: z.string().max(500).optional(),
}).strict();

/** Browser snapshots are untrusted input, not server records or verified facts. */
export const caseSnapshotSchema = caseMetadataSchema.extend({
  id: snapshotId,
  thana: shortText.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  demo: z.boolean(),
  documents: z.array(snapshotDocumentSchema).max(20),
}).strict().superRefine((property, ctx) => {
  if (new Set(property.documents.map(document => document.id)).size !== property.documents.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Document identifiers must be unique.' });
  }
  // Bound aggregate evidence size in addition to each field and HTTP body. This
  // prevents a valid but enormous snapshot from consuming excessive model input.
  if (JSON.stringify(property).length > 160_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The case has too much evidence for one AI request.' });
  }
});

export const assistantRequestSchema = z.object({
  case: caseSnapshotSchema,
  question: z.string().trim().min(3).max(2000),
  consent: z.literal(true),
}).strict();
