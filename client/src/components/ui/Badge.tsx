import React from 'react';
import clsx from 'clsx';
import { FileStatus, RunStatus, AgreementStatus } from '@shared/types';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'processing';

interface BadgeProps {
  children?: React.ReactNode;
  variant?: BadgeVariant;
  status?: FileStatus | RunStatus | AgreementStatus | string;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ children, variant, status, className }) => {
  // Mapping logic for automatic variants based on status
  const getVariant = (): BadgeVariant => {
    if (variant) return variant;

    switch (status) {
      case FileStatus.COMPLETED:
      case RunStatus.COMPLETED:
      case AgreementStatus.VERIFIED:
        return 'success';

      case FileStatus.ERROR:
        return 'danger';

      case FileStatus.PROCESSING:
      case RunStatus.RUNNING:
        return 'processing';

      case AgreementStatus.SUSPICIOUS:
      case RunStatus.CANCELLED:
        return 'warning';

      case FileStatus.PENDING:
      case FileStatus.SKIPPED:
      case AgreementStatus.LOW_CONFIDENCE:
        return 'secondary';

      default:
        return 'primary';
    }
  };

  const activeVariant = getVariant();

  const variants = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success/10 text-success',
    danger: 'bg-danger/10 text-danger',
    warning: 'bg-warning/10 text-warning',
    processing: 'bg-primary/20 text-primary animate-pulse',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[activeVariant],
        className,
      )}
    >
      {children ?? status}
    </span>
  );
};

export default Badge;
