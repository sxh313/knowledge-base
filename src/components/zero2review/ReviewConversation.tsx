import SourceList from './SourceList';
import type { Zero2TutorResponse } from '../../lib/zero2review/types';
import MarkdownContent from '../MarkdownContent';

export default function ReviewConversation({ response }: { response?: Zero2TutorResponse }) {
  if (!response) return null;
  return <article className="card space-y-4 p-5"><div className="text-xs text-[var(--color-text-tertiary)]">基于课程原文的讲解</div><MarkdownContent>{response.answer}</MarkdownContent><SourceList citations={response.citations} /></article>;
}
