/* src/components/AppLayout.tsx */
'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import styles from '../styles/layout.module.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className={styles.container}>
      {/* Mobile Hamburger Button */}
      <button
        className={styles.mobileMenuToggle}
        onClick={toggleSidebar}
        aria-label="Toggle navigation menu"
        style={{
          position: 'fixed',
          top: '12px',
          left: '16px',
          zIndex: 105,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        <TopBar />
        <main className={styles.pageBody}>{children}</main>
      </div>
    </div>
  );
}
