export interface AuthUser {
  id: string;
  discordId: string;
  username: string;
  avatar?: string | null;
  globalName?: string | null;
  admin: boolean;
}

export interface OverviewServer {
  id: string;
  name: string;
  icon?: string | null;
  isOwner: boolean;
  stats: {
    members?: number;
    online?: number | null;
    joins24h: number;
    leaves24h: number;
    moderation24h: number;
    openAlerts: number;
    securityScore?: number | null;
    recentActivity: Array<{ type: string; message: string; createdAt: string }>;
  };
  bot: { configured: boolean };
}

export interface OverviewData {
  global: {
    connectedServers: number;
    totalMembers: number;
    openAlerts: number;
    botConnected: boolean;
    apiStatus: string;
    databaseStatus: string;
    sentinel: string;
  };
  servers: OverviewServer[];
  generatedAt: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  icon?: string | null;
  memberCount: number;
  securityStrength?: number | null;
  counts: {
    roles: number;
    openTickets: number;
    runningGiveaways: number;
    scheduledEvents: number;
    auditRecords: number;
  };
  botConnected: boolean;
  prefix: string;
}

export interface ModerationCase {
  id: string;
  caseNumber: number;
  action: string;
  reason?: string | null;
  moderatorId?: string | null;
  targetId?: string | null;
  guildId: string;
  source: string;
  channelId?: string | null;
  createdAt: string;
}

export interface SecurityReport {
  score: number;
  coverage: { enabled: number; total: number; protected: boolean };
  checks: Array<{ label: string; status: 'ok' | 'warn' | 'critical'; detail?: string }>;
  weaknesses: string[];
  recommendations: string[];
  lastAssessment?: string | null;
}

export interface Alert {
  id: string;
  guildId: string;
  severity: string;
  category: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  guildId: string;
  actorId?: string | null;
  action: string;
  category: string;
  detail?: unknown;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  guildId: string;
  type: string;
  actorId?: string | null;
  message: string;
  createdAt: string;
}

export interface ServerMember {
  id: string;
  guildId: string;
  userId: string;
  username: string;
  displayName?: string | null;
  joinedAt?: string | null;
  lastSeenAt?: string | null;
  discordRoles?: string[];
  messageCount?: number;
}

export interface AutomodRule {
  id: string;
  guildId: string;
  name: string;
  kind: string;
  enabled: boolean;
  config?: unknown;
}

export interface ModerationRole {
  key: string;
  guildId: string;
  name: string;
  color?: string | null;
  permissions: string[];
}

export interface Ticket {
  id: string;
  guildId: string;
  panelId?: string | null;
  authorId?: string | null;
  subject: string;
  status: string;
  assignedToId?: string | null;
  createdAt: string;
}

export interface Giveaway {
  id: string;
  guildId: string;
  prize: string;
  status: string;
  winnerCount: number;
  endsAt: string;
  winners?: string[];
}

export interface CustomCommand {
  id: string;
  guildId: string;
  name: string;
  type: string;
  enabled: boolean;
  permission?: string[] | null;
}

export interface DiscordEvent {
  id: string;
  guildId: string;
  name: string;
  description?: string | null;
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  status: string;
}

export interface ScheduledMessage {
  id: string;
  guildId: string;
  channelId: string;
  content?: string | null;
  scheduledFor: string;
  status: string;
  recurring?: string | null;
}

export interface Backup {
  id: string;
  guildId: string;
  label?: string | null;
  createdAt: string;
  size: number;
  settings?: unknown;
}

export interface DiagnosticInfo {
  botConnected: boolean;
  botUptimeMs?: number | null;
  apiLatencyMs?: number | null;
  databaseConnected: boolean;
  websocket: { connectedClients: number; botConnected: boolean };
  backgroundTasks: Record<string, unknown>;
  errorHistory?: unknown[];
}

export interface HealthInfo {
  status: string;
  uptime: number;
  apiLatencyMs: number;
  api: { ok: boolean; latencyMs: number; uptimeSeconds: number };
  database: { ok: boolean; connected: boolean; latencyMs: number; detail?: string };
  bot: { connected: boolean };
  websocket: { connectedClients: number; botConnected: boolean };
}