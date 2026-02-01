import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background-alt">
        <Header />
        <div className="flex-1 min-h-0">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
