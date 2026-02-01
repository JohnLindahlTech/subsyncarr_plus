import React from 'react';
import clsx from 'clsx';

interface TableProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Table: React.FC<TableProps> = ({ children, className }) => (
  <div className={clsx('bg-surface border border-border rounded-xl shadow-sm overflow-hidden', className)}>
    <table className="w-full text-left border-collapse">{children}</table>
  </div>
);

export const THead: React.FC<TableProps> = ({ children, className }) => (
  <thead className={clsx('bg-background-alt/50 border-b border-border', className)}>{children}</thead>
);

export const TBody: React.FC<TableProps> = ({ children, className }) => (
  <tbody className={clsx('divide-y divide-border', className)}>{children}</tbody>
);

export const TR: React.FC<TableProps> = ({ children, className, onClick }) => (
  <tr
    onClick={onClick}
    className={clsx(
      'transition-colors group',
      onClick ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-background-alt/30',
      className,
    )}
  >
    {children}
  </tr>
);

interface THProps extends TableProps {
  sortable?: boolean;
  active?: boolean;
  order?: 'ASC' | 'DESC';
}

export const TH: React.FC<THProps> = ({ children, className, sortable, active, order, onClick }) => (
  <th
    onClick={onClick}
    className={clsx(
      'px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary',
      sortable && 'cursor-pointer hover:text-primary transition-colors group/th',
      active && 'text-primary',
      className,
    )}
  >
    <div className="flex items-center gap-2">
      {children}
      {sortable ? (
        <span className={clsx('transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-40')}>
          {active && order === 'DESC' ? '↓' : '↑'}
        </span>
      ) : null}
    </div>
  </th>
);

interface TDProps extends TableProps {
  colSpan?: number;
  title?: string;
}

export const TD: React.FC<TDProps> = ({ children, className, ...props }) => (
  <td className={clsx('px-6 py-4 text-sm font-medium text-foreground', className)} {...props}>
    {children}
  </td>
);
