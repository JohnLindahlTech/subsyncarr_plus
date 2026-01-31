import { NavLink } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

const Sidebar = () => {
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const navItems = [
    { to: '/', icon: '⚡', label: 'Live Run' },
    { to: '/explorer', icon: '📂', label: 'Library Explorer' },
    { to: '/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/history', icon: '📜', label: 'Run History' },
    { to: '/system', icon: '⚙️', label: 'System Health' },
    { to: '/docs', icon: '📚', label: 'How It Works' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">Subsyncarr++</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button onClick={toggleTheme} className="theme-toggle">
          <span id="themeIcon">🌓</span>
          <span id="themeLabel">Theme</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
