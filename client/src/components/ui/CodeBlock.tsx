import React from 'react';
import clsx from 'clsx';
import { Label } from './Typography';

interface CodeBlockProps {
  label?: string;
  code: string;
  className?: string;
  variant?: 'dark' | 'ghost';
  maxHeight?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ label, code, className, variant = 'dark', maxHeight }) => {
  return (
    <div className={clsx('space-y-2', className)}>
      {label && <Label>{label}</Label>}
      <pre
        style={{ maxHeight }}
        className={clsx(
          'p-4 rounded-lg font-mono text-xs overflow-x-auto leading-relaxed custom-scrollbar border',
          variant === 'dark'
            ? 'bg-code-bg text-code-text border-white/5 shadow-inner'
            : 'bg-background-alt text-foreground-secondary italic border-border',
        )}
      >
        {code || '-'}
      </pre>
    </div>
  );
};

export default CodeBlock;
