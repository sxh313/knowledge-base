import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface CardFlipProps {
  front: string;
  back: string;
  tags?: string[];
}

export default function CardFlip({ front, back, tags }: CardFlipProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className="perspective-1000 cursor-pointer w-full max-w-lg mx-auto"
      onClick={() => !isFlipped && setIsFlipped(true)}
    >
      <div className={`relative w-full min-h-[280px] transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Front */}
        <div className={`absolute inset-0 card flex flex-col items-center justify-center p-8 backface-hidden ${isFlipped ? 'invisible' : ''}`}>
          {tags && tags.length > 0 && (
            <div className="mb-4 flex gap-1.5 flex-wrap justify-center">
              {tags.map(t => (
                <span key={t} className="tag-gray text-xs">{t}</span>
              ))}
            </div>
          )}
          <div className="prose-custom text-center">
            <ReactMarkdown>{front}</ReactMarkdown>
          </div>
          {!isFlipped && (
            <p className="mt-6 text-xs text-[var(--color-text-secondary)]">
              👆 点击翻转查看答案
            </p>
          )}
        </div>

        {/* Back */}
        <div className={`absolute inset-0 card flex flex-col items-center justify-center p-8 backface-hidden rotate-y-180 border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/30 ${!isFlipped ? 'invisible' : ''}`}>
          <span className="tag-brand mb-4 text-xs">答案</span>
          <div className="prose-custom text-center">
            <ReactMarkdown>{back}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}