import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = '600px', footer }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('fixed')) onClose();
      }}
    >
      <div
        className="bg-surface border border-border shadow-md rounded-lg flex flex-col w-full animate-in zoom-in-95 duration-200"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <button
            className="p-2 hover:bg-secondary rounded-full transition-colors text-foreground-secondary hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[80vh]">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-background-alt">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
