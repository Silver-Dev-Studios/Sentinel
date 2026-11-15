-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_commands" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,

    CONSTRAINT "bot_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" VARCHAR(512),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorized_servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" TEXT NOT NULL,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "authorized_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerConfiguration" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '!',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "snipeRetentionSeconds" INTEGER NOT NULL DEFAULT 604800,
    "snipeLogging" BOOLEAN NOT NULL DEFAULT true,
    "welcomeChannelId" TEXT,
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeTemplate" TEXT NOT NULL DEFAULT '',
    "welcomeEmbed" JSONB,
    "goodbyeChannelId" TEXT,
    "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeTemplate" TEXT NOT NULL DEFAULT '',
    "goodbyeEmbed" JSONB,
    "retentionAuditDays" INTEGER NOT NULL DEFAULT 365,
    "retentionModerationDays" INTEGER NOT NULL DEFAULT 730,
    "retentionActivityDays" INTEGER NOT NULL DEFAULT 90,
    "retentionAlertDays" INTEGER NOT NULL DEFAULT 90,
    "retentionSnipeDays" INTEGER NOT NULL DEFAULT 7,
    "activityFeedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "antiRaidEnabled" BOOLEAN NOT NULL DEFAULT false,
    "antiRaidJoinThreshold" INTEGER NOT NULL DEFAULT 10,
    "antiRaidWindowSeconds" INTEGER NOT NULL DEFAULT 60,
    "antiRaidAccountAgeSeconds" INTEGER NOT NULL DEFAULT 86400,
    "antiRaidResponse" TEXT NOT NULL DEFAULT 'alert',
    "antiNukeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "antiNukeChannelDeleteThreshold" INTEGER NOT NULL DEFAULT 3,
    "antiNukeRoleDeleteThreshold" INTEGER NOT NULL DEFAULT 3,
    "antiNukeBanThreshold" INTEGER NOT NULL DEFAULT 5,
    "antiNukeWindowSeconds" INTEGER NOT NULL DEFAULT 60,
    "antiNukeResponse" TEXT NOT NULL DEFAULT 'alert',
    "antiSpamEnabled" BOOLEAN NOT NULL DEFAULT false,
    "antiSpamMaxMessages" INTEGER NOT NULL DEFAULT 5,
    "antiSpamWindowSeconds" INTEGER NOT NULL DEFAULT 5,
    "antiSpamMaxMentions" INTEGER NOT NULL DEFAULT 4,
    "antiSpamEscalation" TEXT NOT NULL DEFAULT 'warn',
    "antiSpamTimeoutSeconds" INTEGER NOT NULL DEFAULT 600,
    "permissionScanEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trustedAdminIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lockdownEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lockdownActive" BOOLEAN NOT NULL DEFAULT false,
    "lockdownActivatedBy" TEXT,
    "lockdownActivatedAt" TIMESTAMP(3),
    "lockdownChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lockdownRoleId" TEXT,
    "lockdownPingRoleId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automod_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "warnCooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "maxWarnThreshold" INTEGER NOT NULL DEFAULT 5,
    "timeoutCooldownSeconds" INTEGER NOT NULL DEFAULT 300,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automod_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automod_rules" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'warn',
    "timeoutSeconds" INTEGER,
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automod_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_channels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_members" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "joinedAt" TIMESTAMP(3),
    "discordRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastVoiceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_role_assignments" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isOwnerRole" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "moderatorId" TEXT,
    "targetId" TEXT,
    "reason" TEXT,
    "detail" JSONB,
    "source" TEXT NOT NULL,
    "commandName" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_warnings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "moderatorId" TEXT,
    "reason" TEXT NOT NULL,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "moderation_warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snipe_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snipe_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_assessments" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT,
    "embeds" JSONB,
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_delivery_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "messageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT,
    "embeds" JSONB,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "recurring" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordEventId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "channelId" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "rsvpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderMinutes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendees" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "panelId" TEXT,
    "panelName" TEXT,
    "category" TEXT NOT NULL,
    "channelId" TEXT,
    "ownerId" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "transcriptUrl" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstResponseAt" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_participants" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_panels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "channelId" TEXT,
    "openingMessage" TEXT,
    "questions" JSONB,
    "staffRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_transcripts" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaways" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "description" TEXT,
    "winnerCount" INTEGER NOT NULL DEFAULT 1,
    "durationSeconds" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "requirements" JSONB,
    "winners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rerolledAt" TIMESTAMP(3),
    "rerolledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_entries" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "resource" TEXT,
    "detail" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "detail" JSONB,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_records" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memberCount" INTEGER,
    "joins" INTEGER NOT NULL DEFAULT 0,
    "leaves" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "moderationActions" INTEGER NOT NULL DEFAULT 0,
    "ticketVolume" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB,

    CONSTRAINT "analytics_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_commands" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "embeds" JSONB,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredPermission" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_tasks" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "recurring" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welcome_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeChannelId" TEXT,
    "welcomeTemplate" TEXT NOT NULL DEFAULT '',
    "welcomeEmbed" JSONB,
    "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeChannelId" TEXT,
    "goodbyeTemplate" TEXT NOT NULL DEFAULT '',
    "goodbyeEmbed" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "welcome_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inactivity_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "exemptRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportChannelId" TEXT,
    "notifyAdmins" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inactivity_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_announcements" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "embeds" JSONB,
    "channelId" TEXT,
    "announcementType" TEXT NOT NULL DEFAULT 'update',
    "sentAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_backups" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdBy" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_logs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "diagnostic_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_discordId_key" ON "users"("discordId");

-- CreateIndex
CREATE INDEX "bot_commands_status_createdAt_idx" ON "bot_commands"("status", "createdAt");

-- CreateIndex
CREATE INDEX "bot_commands_guildId_createdAt_idx" ON "bot_commands"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_guildId_createdAt_idx" ON "activity_events"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "authorized_servers_active_idx" ON "authorized_servers"("active");

-- CreateIndex
CREATE INDEX "access_logs_guildId_createdAt_idx" ON "access_logs"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServerConfiguration_guildId_key" ON "ServerConfiguration"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "security_settings_guildId_key" ON "security_settings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "automod_settings_guildId_key" ON "automod_settings"("guildId");

-- CreateIndex
CREATE INDEX "automod_rules_guildId_kind_idx" ON "automod_rules"("guildId", "kind");

-- CreateIndex
CREATE INDEX "server_channels_guildId_idx" ON "server_channels"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "server_channels_guildId_channelId_key" ON "server_channels"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "server_members_guildId_userId_idx" ON "server_members"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "server_members_guildId_userId_key" ON "server_members"("guildId", "userId");

-- CreateIndex
CREATE INDEX "member_role_assignments_guildId_roleKey_idx" ON "member_role_assignments"("guildId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "member_role_assignments_guildId_userId_roleKey_key" ON "member_role_assignments"("guildId", "userId", "roleKey");

-- CreateIndex
CREATE INDEX "moderation_roles_guildId_idx" ON "moderation_roles"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_roles_guildId_key_key" ON "moderation_roles"("guildId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_roles_guildId_name_key" ON "moderation_roles"("guildId", "name");

-- CreateIndex
CREATE INDEX "moderation_role_permissions_guildId_idx" ON "moderation_role_permissions"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_role_permissions_roleId_permission_key" ON "moderation_role_permissions"("roleId", "permission");

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_createdAt_idx" ON "moderation_cases"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_targetId_idx" ON "moderation_cases"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_action_idx" ON "moderation_cases"("guildId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_cases_guildId_caseNumber_key" ON "moderation_cases"("guildId", "caseNumber");

-- CreateIndex
CREATE INDEX "moderation_warnings_guildId_memberId_active_idx" ON "moderation_warnings"("guildId", "memberId", "active");

-- CreateIndex
CREATE INDEX "snipe_logs_guildId_channelId_deletedAt_idx" ON "snipe_logs"("guildId", "channelId", "deletedAt");

-- CreateIndex
CREATE INDEX "snipe_logs_deletedAt_idx" ON "snipe_logs"("deletedAt");

-- CreateIndex
CREATE INDEX "security_events_guildId_createdAt_idx" ON "security_events"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "security_assessments_guildId_createdAt_idx" ON "security_assessments"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "message_templates_guildId_idx" ON "message_templates"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_guildId_name_key" ON "message_templates"("guildId", "name");

-- CreateIndex
CREATE INDEX "message_delivery_logs_guildId_createdAt_idx" ON "message_delivery_logs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "scheduled_messages_status_scheduledFor_idx" ON "scheduled_messages"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "scheduled_messages_guildId_idx" ON "scheduled_messages"("guildId");

-- CreateIndex
CREATE INDEX "discord_events_guildId_startsAt_idx" ON "discord_events"("guildId", "startsAt");

-- CreateIndex
CREATE INDEX "event_attendees_guildId_idx" ON "event_attendees"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "event_attendees_eventId_userId_key" ON "event_attendees"("eventId", "userId");

-- CreateIndex
CREATE INDEX "tickets_guildId_status_idx" ON "tickets"("guildId", "status");

-- CreateIndex
CREATE INDEX "tickets_guildId_openedAt_idx" ON "tickets"("guildId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_participants_ticketId_userId_key" ON "ticket_participants"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "ticket_panels_guildId_idx" ON "ticket_panels"("guildId");

-- CreateIndex
CREATE INDEX "ticket_transcripts_guildId_createdAt_idx" ON "ticket_transcripts"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "giveaways_guildId_status_idx" ON "giveaways"("guildId", "status");

-- CreateIndex
CREATE INDEX "giveaways_endsAt_idx" ON "giveaways"("endsAt");

-- CreateIndex
CREATE INDEX "giveaway_entries_guildId_idx" ON "giveaway_entries"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_entries_giveawayId_userId_key" ON "giveaway_entries"("giveawayId", "userId");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_createdAt_idx" ON "audit_logs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_category_createdAt_idx" ON "audit_logs"("guildId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_status_createdAt_idx" ON "alerts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_guildId_createdAt_idx" ON "alerts"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_records_guildId_period_date_idx" ON "analytics_records"("guildId", "period", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_records_guildId_period_date_key" ON "analytics_records"("guildId", "period", "date");

-- CreateIndex
CREATE INDEX "custom_commands_guildId_kind_idx" ON "custom_commands"("guildId", "kind");

-- CreateIndex
CREATE INDEX "automation_rules_guildId_trigger_idx" ON "automation_rules"("guildId", "trigger");

-- CreateIndex
CREATE INDEX "scheduled_tasks_status_runAt_idx" ON "scheduled_tasks"("status", "runAt");

-- CreateIndex
CREATE INDEX "scheduled_tasks_guildId_type_idx" ON "scheduled_tasks"("guildId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "welcome_settings_guildId_key" ON "welcome_settings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "inactivity_settings_guildId_key" ON "inactivity_settings"("guildId");

-- CreateIndex
CREATE INDEX "project_announcements_guildId_project_idx" ON "project_announcements"("guildId", "project");

-- CreateIndex
CREATE INDEX "config_backups_guildId_createdAt_idx" ON "config_backups"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "diagnostic_logs_service_createdAt_idx" ON "diagnostic_logs"("service", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerConfiguration" ADD CONSTRAINT "ServerConfiguration_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "authorized_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automod_settings" ADD CONSTRAINT "automod_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automod_rules" ADD CONSTRAINT "automod_rules_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_role_assignments" ADD CONSTRAINT "member_role_assignments_guildId_userId_fkey" FOREIGN KEY ("guildId", "userId") REFERENCES "server_members"("guildId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_role_permissions" ADD CONSTRAINT "moderation_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "moderation_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("discordId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("discordId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_warnings" ADD CONSTRAINT "moderation_warnings_guildId_memberId_fkey" FOREIGN KEY ("guildId", "memberId") REFERENCES "server_members"("guildId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_events" ADD CONSTRAINT "discord_events_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "discord_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("discordId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_records" ADD CONSTRAINT "analytics_records_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_commands" ADD CONSTRAINT "custom_commands_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welcome_settings" ADD CONSTRAINT "welcome_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inactivity_settings" ADD CONSTRAINT "inactivity_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_announcements" ADD CONSTRAINT "project_announcements_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_backups" ADD CONSTRAINT "config_backups_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "ServerConfiguration"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_logs" ADD CONSTRAINT "diagnostic_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("discordId") ON DELETE SET NULL ON UPDATE CASCADE;

