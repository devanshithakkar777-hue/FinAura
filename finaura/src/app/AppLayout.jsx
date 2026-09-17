import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function AppLayout({ page, onNav, children }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b14] text-slate-900 dark:text-white">
      <Sidebar active={page} onNav={onNav} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:ml-[220px] flex flex-col min-h-screen">
        <Navbar page={page} onMenuOpen={() => setNavOpen(true)} />
        <main className="flex-1 p-6 max-w-[1200px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
