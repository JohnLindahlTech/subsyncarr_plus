import { NavLink } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import clsx from 'clsx';

const Sidebar = () => {
  const { theme, toggleTheme } = useAppStore();

  const navItems = [
    { to: '/', icon: '⚡', label: 'Live Run' },
    { to: '/explorer', icon: '📂', label: 'Library Explorer' },
    { to: '/statistics', icon: '📊', label: 'Statistics' },
    { to: '/history', icon: '📜', label: 'Run History' },
    { to: '/system', icon: '⚙️', label: 'System Health' },
    { to: '/docs', icon: '📚', label: 'How It Works' },
  ];

  return (
    <aside className="w-64 border-r border-border bg-background h-screen flex flex-col shrink-0">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 text-primary">
          <span className="text-2xl">🎬</span>
          <span className="font-bold text-lg tracking-tight">Subsyncarr++</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium text-sm',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-secondary hover:bg-secondary hover:text-foreground',
              )
            }
          >
            <span className="text-xl opacity-80">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-sm font-medium text-foreground-secondary hover:text-foreground"
        >
          <span className="text-xl opacity-80">{theme === 'light' ? '🌙' : '☀️'}</span>
          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
