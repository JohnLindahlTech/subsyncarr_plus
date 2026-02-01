import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => (
  <div className={clsx('bg-surface border border-border shadow-sm rounded-lg overflow-hidden', className)}>
    {children}
  </div>
);

export const CardHeader: React.FC<CardProps> = ({ children, className }) => (
  <div className={clsx('px-6 py-4 border-b border-border', className)}>{children}</div>
);

export const CardContent: React.FC<CardProps> = ({ children, className }) => (
  <div className={clsx('px-6 py-4', className)}>{children}</div>
);

export const CardFooter: React.FC<CardProps> = ({ children, className }) => (
  <div className={clsx('px-6 py-4 border-t border-border bg-background-alt', className)}>{children}</div>
);
