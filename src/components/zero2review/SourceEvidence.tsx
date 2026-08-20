import SourceList from './SourceList';
import type { Zero2SourceReference } from '../../lib/zero2review/types';

export default function SourceEvidence({ citations }: { citations: Zero2SourceReference[] }) {
  return <SourceList citations={citations} />;
}
