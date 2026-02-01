import React from 'react';
import clsx from 'clsx';

interface ViewContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ViewContainer - Centralized wrapper for all top-level views.
 * Handles entry animations, padding, and provides a full-height flex container.
 */
const ViewContainer: React.FC<ViewContainerProps> = ({ children, className }) => {
  return (
    <section
      className={clsx(
        'flex flex-col h-full p-8 animate-in fade-in slide-in-from-bottom-2 duration-500 min-h-0',
        className,
      )}
    >
      {children}
    </section>
  );
};

export default ViewContainer;
