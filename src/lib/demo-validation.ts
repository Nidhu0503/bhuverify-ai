import { z } from 'zod';
import { FIELD_LABELS } from './types';

export const documentKindSchema = z.enum(['sale_deed', 'jamabandi', 'mutation', 'lagaan', 'map', 'encumbrance', 'other']);
const evidenceSchema = z.object({
  value: z.string().trim().min(1).max(1000),
  page: z.number().int().min(1).max(1000).nullable(),
  quote: z.string().max(2000),
  confidence: z.enum(['high', 'medium', 'low']),
}).strict();
export const fieldsSchema = z.record(z.enum(Object.keys(FIELD_LABELS) as [keyof typeof FIELD_LABELS, ...(keyof typeof FIELD_LABELS)[]]), evidenceSchema);
const shortText = z.string().trim().max(160);
export const caseMetadataSchema = z.object({
  title: z.string().trim().min(1).max(120), state: z.literal('BR'),
  district: shortText.default(''), circle: shortText.default(''), mauza: shortText.default(''),
  khata: shortText.default(''), khesra: shortText.default(''), seller: shortText.default(''),
  purpose: z.enum(['purchase', 'mutation', 'records']).default('purchase'),
}).strict();
export const createCaseSchema = z.union([z.object({ demoId: z.string().min(1).max(80) }).strict(), caseMetadataSchema]);
export const patchCaseSchema = z.union([
  z.object({ documentId: z.string().min(1).max(100), fields: fieldsSchema, reviewed: z.literal(true) }).strict(),
  caseMetadataSchema.partial().refine(value => Object.keys(value).length > 0, 'Supply at least one editable field.'),
]);
export const questionSchema = z.object({ question: z.string().trim().min(3).max(2000), consent: z.literal(true).optional() }).strict();
