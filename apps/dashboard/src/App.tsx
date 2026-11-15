import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ServerProvider } from './lib/server';
import { Layout } from './components/Layout';
import { Loader2 } from 'lucide-react';
import { LoginPage } from './pages/Login';

/**
 * Most pages are code-split so the initial bundle only contains the app shell
 * (layout, auth, Login) plus the Overview page; the rest load on navigation.
 * This cuts the initial JS the browser downloads for GitHub Pages hosting.
 */
const OverviewPage = lazy(() => import('./pages/general/Overview').then((m) => ({ default: m.OverviewPage })));
const ServerSelectorPage = lazy(() => import('./pages/general/ServerSelector').then((m) => ({ default: m.ServerSelectorPage })));
const MonitoringPage = lazy(() => import('./pages/general/Monitoring').then((m) => ({ default: m.MonitoringPage })));
const AnalyticsPage = lazy(() => import('./pages/general/Analytics').then((m) => ({ default: m.AnalyticsPage })));
const ModerationPage = lazy(() => import('./pages/moderation/Moderation').then((m) => ({ default: m.ModerationPage })));
const QuickActionsPage = lazy(() => import('./pages/moderation/QuickActions').then((m) => ({ default: m.QuickActionsPage })));
const ModerationRolesPage = lazy(() => import('./pages/moderation/ModerationRoles').then((m) => ({ default: m.ModerationRolesPage })));
const AutoModPage = lazy(() => import('./pages/moderation/AutoMod').then((m) => ({ default: m.AutoModPage })));
const ModerationLogsPage = lazy(() => import('./pages/moderation/ModerationLogs').then((m) => ({ default: m.ModerationLogsPage })));
const MessageBuilderPage = lazy(() => import('./pages/management/MessageBuilder').then((m) => ({ default: m.MessageBuilderPage })));
const EventBuilderPage = lazy(() => import('./pages/management/EventBuilder').then((m) => ({ default: m.EventBuilderPage })));
const TicketSystemPage = lazy(() => import('./pages/management/TicketSystem').then((m) => ({ default: m.TicketSystemPage })));
const GiveawaysPage = lazy(() => import('./pages/management/Giveaways').then((m) => ({ default: m.GiveawaysPage })));
const CustomCommandsPage = lazy(() => import('./pages/management/CustomCommands').then((m) => ({ default: m.CustomCommandsPage })));
const SchedulerPage = lazy(() => import('./pages/management/Scheduler').then((m) => ({ default: m.SchedulerPage })));
const SecurityOverviewPage = lazy(() => import('./pages/security/SecurityOverview').then((m) => ({ default: m.SecurityOverviewPage })));
const AutoRaidPage = lazy(() => import('./pages/security/AutoRaid').then((m) => ({ default: m.AutoRaidPage })));
const AutoNukePage = lazy(() => import('./pages/security/AutoNuke').then((m) => ({ default: m.AutoNukePage })));
const AutoSpamPage = lazy(() => import('./pages/security/AutoSpam').then((m) => ({ default: m.AutoSpamPage })));
const PermissionSecurityPage = lazy(() => import('./pages/security/PermissionSecurity').then((m) => ({ default: m.PermissionSecurityPage })));
const BackupsPage = lazy(() => import('./pages/security/Backups').then((m) => ({ default: m.BackupsPage })));
const AlertCenterPage = lazy(() => import('./pages/system/AlertCenter').then((m) => ({ default: m.AlertCenterPage })));
const AuditCenterPage = lazy(() => import('./pages/system/AuditCenter').then((m) => ({ default: m.AuditCenterPage })));
const DiagnosticsPage = lazy(() => import('./pages/system/Diagnostics').then((m) => ({ default: m.DiagnosticsPage })));
const SettingsPage = lazy(() => import('./pages/system/Settings').then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFoundPage })));

function PageLoader() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-sentinel-accent2" />
    </div>
  );
}

function LoginGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sentinel-accent2" />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <LoginGate>
      <ServerProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/servers" element={<ServerSelectorPage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
            <Route path="/moderation/quick-actions" element={<QuickActionsPage />} />
            <Route path="/moderation/roles" element={<ModerationRolesPage />} />
            <Route path="/automod" element={<AutoModPage />} />
            <Route path="/moderation/logs" element={<ModerationLogsPage />} />
            <Route path="/messages" element={<MessageBuilderPage />} />
            <Route path="/events" element={<EventBuilderPage />} />
            <Route path="/tickets" element={<TicketSystemPage />} />
            <Route path="/giveaways" element={<GiveawaysPage />} />
            <Route path="/commands" element={<CustomCommandsPage />} />
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/security" element={<SecurityOverviewPage />} />
            <Route path="/security/anti-raid" element={<AutoRaidPage />} />
            <Route path="/security/anti-nuke" element={<AutoNukePage />} />
            <Route path="/security/anti-spam" element={<AutoSpamPage />} />
            <Route path="/security/permissions" element={<PermissionSecurityPage />} />
            <Route path="/security/backups" element={<BackupsPage />} />
            <Route path="/alerts" element={<AlertCenterPage />} />
            <Route path="/audit" element={<AuditCenterPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="/login" element={<Navigate to="/" replace />} />
        </Routes>
      </ServerProvider>
    </LoginGate>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}