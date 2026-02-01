import React from 'react';
import clsx from 'clsx';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const Heading: React.FC<TypographyProps> = ({ children, className }) => (
  <h2 className={clsx('text-xl font-bold text-foreground', className)}>{children}</h2>
);

export const Subheading: React.FC<TypographyProps> = ({ children, className }) => (
  <h3 className={clsx('font-bold text-foreground', className)}>{children}</h3>
);

export const Label: React.FC<TypographyProps> = ({ children, className, title }) => (
  <label
    title={title}
    className={clsx('text-xxs font-black uppercase tracking-[0.2em] text-foreground-secondary opacity-60', className)}
  >
    {children}
  </label>
);
