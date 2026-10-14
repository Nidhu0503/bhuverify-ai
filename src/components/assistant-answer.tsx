import { Fragment } from 'react';
import { citationFreshness, distinctAssistantSources, parseInlineCitations } from '@/lib/assistant-citations';
import { FIELD_LABELS, type AssistantSource, type PropertyDocument } from '@/lib/types';
import './assistant-answer.css';

const pageLabel = (page: number | null) => page === null ? 'Page unavailable' : `Page ${page}`;
const citationLabel = (source: AssistantSource) => `Citation ${source.id}: ${FIELD_LABELS[source.field]} — ${source.documentName}, ${pageLabel(source.page)}`;

export function AssistantAnswerContent({ answer, sources = [], onCitation }: {
  answer: string;
  sources?: AssistantSource[];
  onCitation: (source: AssistantSource) => void;
}) {
  const uniqueSources = distinctAssistantSources(sources);
  const byId = new Map(uniqueSources.map(source => [source.id, source]));
  return <div className="assistant-answer">
    <p className="assistant-answer-text">{parseInlineCitations(answer).map((segment, index) => {
      if (segment.kind === 'text' || segment.ids.some(id => !byId.has(id))) return <Fragment key={index}>{segment.text}</Fragment>;
      return <Fragment key={index}>{segment.ids.map(id => {
        const source = byId.get(id)!;
        return <button key={id} type="button" className="inline-citation" aria-label={citationLabel(source)} onClick={() => onCitation(source)}>[{id}]</button>;
      })}</Fragment>;
    })}</p>
    {uniqueSources.length > 0 && <div className="assistant-source-list">
      <h4>Evidence cited in this answer</h4>
      <ul>{uniqueSources.map(source => <li key={source.id}>
        <button type="button" className="chat-source assistant-source" aria-label={citationLabel(source)} onClick={() => onCitation(source)}>
          <strong>[{source.id}] {FIELD_LABELS[source.field]}</strong>
          <span>{source.documentName} · {pageLabel(source.page)}</span>
        </button>
      </li>)}</ul>
    </div>}
  </div>;
}

/** Deliberately read-only: the exact server-derived snapshot stays visible even
 * if a source is edited or deleted after this answer. */
export function CitationSnapshot({ source, documents }: { source: AssistantSource; documents: PropertyDocument[] }) {
  const freshness = citationFreshness(source, documents);
  return <div className="citation-snapshot">
    <p>This is the evidence snapshot used when this answer was generated.</p>
    {freshness === 'missing' && <p className="citation-snapshot-warning" role="status">This document is no longer in this case. The original citation snapshot is preserved below.</p>}
    {freshness === 'changed' && <p className="citation-snapshot-warning" role="status">This document or field has changed since the answer. The original citation snapshot is preserved below; ask again for an updated answer.</p>}
    <dl>
      <div><dt>Document</dt><dd>{source.documentName}</dd></div>
      <div><dt>Field</dt><dd>{FIELD_LABELS[source.field]}</dd></div>
      <div><dt>Value used in the answer</dt><dd>{source.value}</dd></div>
      <div><dt>Page</dt><dd>{source.page ?? 'Page unavailable'}</dd></div>
    </dl>
    <h3>Exact supporting quote</h3>
    <blockquote dir="auto">{source.quote}</blockquote>
    <p className="citation-snapshot-boundary">A citation links an answer to uploaded evidence. It does not authenticate the document, verify ownership, or establish that the answer is correct. Compare this quote with the original document.</p>
  </div>;
}
