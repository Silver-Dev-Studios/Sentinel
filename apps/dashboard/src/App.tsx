import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ServerProvider } from './lib/server';
import { Layout } from './components/Layout';
import { Shield, Loader2 } from 'lucide-react';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/general/Overview';
import { ServerSelectorPage } from './pages/general/ServerSelector';
import { MonitoringPage } from './pages/general/Monitoring';
import { AnalyticsPage } from './pages/general/Analytics';
import { ModerationPage } from './pages/moderation/Moderation';
import { QuickActionsPage } from './pages/moderation/QuickActions';
import { ModerationRolesPage } from './pages/moderation/ModerationRoles';
import { AutoModPage } from './pages/moderation/AutoMod';
import { ModerationLogsPage } from './pages/moderation/ModerationLogs';
import { MessageBuilderPage } from './pages/management/MessageBuilder';
import { EventBuilderPage } from './pages/management/EventBuilder';
import { TicketSystemPage } from './pages/management/TicketSystem';
import { GiveawaysPage } from './pages/management/Giveaways';
import { CustomCommandsPage } from './pages/management/CustomCommands';
import { SchedulerPage } from './pages/management/Scheduler';
import { SecurityOverviewPage } from './pages/security/SecurityOverview';
import { AutoRaidPage } from './pages/security/AutoRaid';
import { AutoNukePage } from './pages/security/AutoNuke';
import { AutoSpamPage } from './pages/security/AutoSpam';
import { PermissionSecurityPage } from './pages/security/PermissionSecurity';
import { BackupsPage } from './pages/security/Backups';
import { AlertCenterPage } from './pages/system/AlertCenter';
import { AuditCenterPage } from './pages/system/AuditCenter';
import { DiagnosticsPage } from './pages/system/Diagnostics';
import { SettingsPage } from './pages/system/Settings';
import { NotFoundPage } from './pages/NotFound';

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
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <LoginGate>
      <ServerProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<OverviewPage />} />
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
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export { Shield };