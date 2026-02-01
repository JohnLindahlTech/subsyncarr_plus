import React from 'react';
import clsx from 'clsx';
import { Label } from './Typography';

interface StatItemProps {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'danger' | 'primary';
  className?: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, value, variant = 'default', className }) => {
  const variants = {
    default: 'bg-background-alt border-border text-foreground',
    success: 'bg-success/5 border-success/10 text-success',
    danger: 'bg-danger/5 border-danger/10 text-danger',
    primary: 'bg-primary/5 border-primary/10 text-primary'
  };

  return (
    <div className={clsx('p-4 rounded-lg border space-y-1', variants[variant], className)}>
      <Label className={clsx(
        variant === 'success' && 'text-success/70',
        variant === 'danger' && 'text-danger/70',
        variant === 'primary' && 'text-primary/70'
      )}>
        {label}
      </Label>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
};

export default StatItem;
