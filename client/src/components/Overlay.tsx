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
    <div className="details-overlay" style={{ display: 'flex' }}>
      <div className="overlay-content">
        <header className="overlay-header">
          <div className="overlay-title-area">
            <button className="btn-icon" onClick={onClose}>
              ✕
            </button>
            <h3>{title}</h3>
          </div>
          {tabs && <nav className="engine-tabs">{tabs}</nav>}
          {headerActions && <div className="header-actions">{headerActions}</div>}
        </header>
        <div className="overlay-body">{children}</div>
      </div>
    </div>
  );
};

export default Overlay;
