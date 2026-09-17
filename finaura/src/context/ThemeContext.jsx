import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

function getStoredTheme() {
  try {
    const stored = localStorage.getItem('finaura-theme');
    if (stored) return stored === 'dark';
  } catch {
    // localStorage blocked (e.g. private browsing with strict settings)
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function setStoredTheme(isDark) {
  try {
    localStorage.setItem('finaura-theme', isDark ? 'dark' : 'light');
  } catch {
    // Silently ignore if storage is unavailable
  }
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(getStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    setStoredTheme(dark);
  }, [dark]);

  const toggle = () => setDark(d => !d);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
