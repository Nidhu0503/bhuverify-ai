import type { AssistantSource, PropertyDocument } from './types';

export type CitationSegment =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; text: string; ids: number[] };

/** Parse only numeric citation markers, never HTML or Markdown. Preserve IDs:
 * source 43 can be one of only two selected sources. Invalid numeric IDs stay
 * visible to the server validator rather than being silently discarded. */
export function parseInlineCitations(answer: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  const marker = /\[\s*(\d+(?:[ \t]*,[ \t]*\d+)*)\s*\]/g;
  let end = 0;
  for (const match of answer.matchAll(marker)) {
    const start = match.index!;
    if (start > end) segments.push({ kind: 'text', text: answer.slice(end, start) });
    segments.push({ kind: 'citation', text: match[0], ids: [...new Set(match[1].split(',').map(Number))] });
    end = start + match[0].length;
  }
  if (end < answer.length) segments.push({ kind: 'text', text: answer.slice(end) });
  return segments;
}

export function getInlineCitationIds(answer: string): number[] {
  return [...new Set(parseInlineCitations(answer).flatMap(segment => segment.kind === 'citation' ? segment.ids : []))];
}

/** A saved citation is a response-time snapshot, not a lookup to replace with
 * today's document fields. Duplicate IDs refer to the same snapshot. */
export function distinctAssistantSources(sources: AssistantSource[]): AssistantSource[] {
  const seen = new Set<number>();
  return sources.filter(source => {
    if (!Number.isSafeInteger(source.id) || source.id < 1 || seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

export function citationFreshness(source: AssistantSource, documents: PropertyDocument[]): 'current' | 'changed' | 'missing' {
  const document = documents.find(item => item.id === source.documentId);
  if (!document) return 'missing';
  if (document.extraction === 'failed' || document.extraction === 'pending') return 'changed';
  const field = document.fields[source.field];
  return document.name === source.documentName && field?.value === source.value && field?.page === source.page && field?.quote === source.quote
    ? 'current'
    : 'changed';
}
