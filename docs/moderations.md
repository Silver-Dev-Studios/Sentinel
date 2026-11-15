# Moderation Reference

## Notation

- `+` = prefix (message) command
- `–` = slash command
- `+/–` = both

## Commands

| Command | Interface | Description |
| --- | --- | --- |
| `+/– ban` | both | Ban a member (optionally deleting message history 0–7 days). |
| `+/– unban` | both | Unban a user by ID. |
| `+/– kick` | both | Kick a member. |
| `+/– warn` | both | Issue a warning with a reason. |
| `+/– timeout` | both | Apply a timeout in minutes. |
| `+/– untime` | both | Remove a timeout. |
| `+/– lock` | both | Lock a channel (options: channel). |
| `+/– unlock` | both | Unlock a channel. |
| `+/– purge` | both | Delete up to 100 messages. |
| `+ snipe` | prefix | Show the most recently deleted message in the channel (short retention). |
| `– userinfo` | slash | Show member information. |

## Moderation logging

Every action creates a `ModerationCase` (and `ModerationWarning` for warnings) with:

- Moderator (user + source)
- Target member
- Action
- Reason
- Timestamp
- Guild ID
- Channel/message where relevant
- Case ID

`source` distinguishes `dashboard`, `discord_command` (slash), and others. Cases are logged to the
Audit Center and searchable from Moderation Logs.

## Dashboard Quick Actions

Quick Actions allow authorized admins to:

- Search members
- View member info + moderation history
- Warn, ban/unban, timeout/untime, kick
- Lock/unlock channels
- Review recent moderation activity

Destructive actions require confirmation.

## Permissions

Each command maps to an application `PermissionKey` (e.g. `moderation.ban`, `moderation.purge`).
Custom Sentinel roles bundle these per server; the backend and bot enforce them. A role can never
exceed the Discord bot's underlying permissions (hierarchy prevents escalation).