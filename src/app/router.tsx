import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/app/layouts/AppLayout';
import { RequireAuth } from '@/features/auth/components/RequireAuth';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SetupPage } from '@/features/auth/pages/SetupPage';
import { PanelPage } from '@/features/panel/pages/PanelPage';
import { MorePage } from '@/features/more/pages/MorePage';
import { CardsPage } from '@/features/cards/pages/CardsPage';
import { CardDetailPage } from '@/features/cards/pages/CardDetailPage';
import { GoalsPage } from '@/features/goals/pages/GoalsPage';
import { ImportPage } from '@/features/import/pages/ImportPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

/**
 * Uma tela principal e um porão.
 *
 * Painel, Mês, Futuro, Plano e Linha do tempo eram cinco recortes do mesmo
 * dado, cada um com seu próprio cálculo — e por isso discordavam entre si.
 * Viraram `PanelPage`. O resto entra por `/more`, que é o caminho até lá.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<PanelPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="cards" element={<CardsPage />} />
            <Route path="cards/:accountId" element={<CardDetailPage />} />
            <Route path="cards/:accountId/:ym" element={<CardDetailPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
