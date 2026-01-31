import React from 'react';
import { FileResult, EngineResult } from '@shared/types';
import clsx from 'clsx';

interface FileCardProps {
  file: FileResult;
}

const basename = (path: string) => path.split('/').pop() || '';

const FileCard: React.FC<FileCardProps> = ({ file }) => {
  const engines: Record<string, EngineResult> = JSON.parse(file.engines || '{}');

  return (
    <div className="file-card">
      <div className="file-header">
        <div className="file-name">{basename(file.file_path)}</div>
        {file.agreement_status && (
          <span className={clsx('agreement-badge', `status-${file.agreement_status}`)}>
            {file.agreement_status.toUpperCase()}
          </span>
        )}
      </div>
      <div className="engine-results-grid">
        {Object.entries(engines).map(([name, result]) => (
          <div key={name} className={clsx('engine-tag', result.success ? 'success' : 'error')}>
            {name}: {result.score !== undefined ? `${result.score}%` : result.success ? '✓' : '✗'}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileCard;
