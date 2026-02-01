import React from 'react';

interface OverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}

const Overlay: React.FC<OverlayProps> = ({ isOpen, onClose, title, tabs, children, headerActions }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-5xl mx-auto my-8 bg-surface border border-border shadow-md rounded-lg flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <header className="flex flex-col border-b border-border">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <button
                className="p-2 hover:bg-secondary rounded-full transition-colors text-foreground-secondary hover:text-foreground"
                onClick={onClose}
              >
                ✕
              </button>
              <h3 className="text-xl font-bold text-foreground">{title}</h3>
            </div>
            {headerActions && <div className="flex gap-3">{headerActions}</div>}
          </div>
          {tabs && <nav className="flex gap-1 px-6 border-t border-border bg-background-alt/50">{tabs}</nav>}
        </header>
        <div className="flex-1 overflow-hidden flex flex-col bg-background">{children}</div>
      </div>
    </div>
  );
};

export default Overlay;
