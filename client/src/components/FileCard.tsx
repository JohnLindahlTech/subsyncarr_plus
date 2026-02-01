import React from 'react';
import { FileResult, EngineResult } from '@shared/types';
import clsx from 'clsx';
import Badge from './ui/Badge';

interface FileCardProps {
  file: FileResult;
}

const basename = (path: string) => path.split('/').pop() || '';

const FileCard: React.FC<FileCardProps> = ({ file }) => {
  const engines: Record<string, EngineResult> = JSON.parse(file.engines || '{}');

  return (
    <div className="p-4 bg-surface border border-border shadow-sm rounded-lg hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3 gap-4">
        <div className="font-semibold text-sm truncate text-foreground" title={basename(file.file_path)}>
          {basename(file.file_path)}
        </div>
        {file.agreement_status && <Badge status={file.agreement_status} />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(engines).map(([name, result]) => (
          <div
            key={name}
            className={clsx(
              'px-2 py-1.5 rounded text-xs font-medium border flex justify-between items-center',
              result.success
                ? 'bg-engine-success-bg text-engine-success-text border-success/20'
                : 'bg-engine-error-bg text-engine-error-text border-danger/20',
            )}
          >
            <span className="opacity-80">{name}</span>
            <span className="font-bold">
              {result.score !== undefined ? `${result.score}%` : result.success ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileCard;
