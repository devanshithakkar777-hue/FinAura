import React, { lazy, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../app/layout/AppLayout';
import OnboardingPage from '../features/onboarding/OnboardingPage';

// Lazy-loaded at module level (not inside render) so React doesn't
// recreate the lazy component on every render, which would cause remounting.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const AIChatAssistant = lazy(() => import('../features/aiChat/AIChatAssistant'));
const PortfolioPage   = lazy(() => import('../pages/Portfolio'));
const MarketsPage     = lazy(() => import('../pages/Markets'));
const RewardsPage     = lazy(() => import('../pages/Rewards'));
const SettingsPage    = lazy(() => import('../pages/Settings'));
const AuthPage        = lazy(() => import('../pages/Auth'));

const PAGES = {
  dashboard: DashboardPage,
  portfolio: PortfolioPage,
  markets:   MarketsPage,
  ai:        AIChatAssistant,
  rewards:   RewardsPage,
  settings:  SettingsPage,
};

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#080b14] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-xl">
          F
        </div>
        <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </motion.div>
    </div>
  );
}

export default function AppRoutes() {
  const { user, profile, loading } = useAuth();
  const [page, setPage] = useState('dashboard');

  if (loading) return <LoadingScreen />;

  // Not logged in — show auth page
  if (!user) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AuthPage />
      </Suspense>
    );
  }

  // Logged in but onboarding not completed (riskProfile is null or missing)
  // OnboardingPage calls refreshProfile() internally when done,
  // which updates AuthContext and causes this component to re-render
  // past this gate automatically.
  if (!profile?.riskProfile) {
    return <OnboardingPage />;
  }

  const Page = PAGES[page] ?? DashboardPage;

  return (
    <AppLayout page={page} onNav={setPage}>
      <Suspense fallback={<LoadingScreen />}>
        <Page />
      </Suspense>
    </AppLayout>
  );
}
