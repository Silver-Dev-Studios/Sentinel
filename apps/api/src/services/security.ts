import type { PrismaClient } from '@prisma/client';

export interface SecurityCheckResult {
  key: string;
  label: string;
  /** true = protection configured & enabled */
  covered: boolean;
  /** 0..1 how strongly the check is satisfied */
  score: number;
  weight: number;
  weakness?: string;
}

export interface SecurityReport {
  score: number; // 0-100 weighted
  checks: SecurityCheckResult[];
  enabled: string[];
  disabled: string[];
  recommendations: string[];
  assessedAt: string;
}

const WEIGHTS: Record<string, number> = {
  anti_raid: 0.22,
  anti_nuke: 0.2,
  anti_spam: 0.18,
  permission_security: 0.15,
  trusted_admins: 0.1,
  emergency_recovery: 0.15,
};

/**
 * Short-TTL in-memory cache for security reports. The Assessment Center shows
 * the report once per page view; Overview and Summary call it for every server
 * on every load and would otherwise hammer the DB with the same queries plus a
 * write per server. The cache only lives in this process, so concurrent Render
 * API instances may each compute once — that is fine, it is idempotent.
 */
const REPORT_CACHE_TTL_MS = 15_000;
const reportCache = new Map<string, SecurityReport>();
const reportTimestamps = new Map<string, number>();

function cachedReport(key: string): SecurityReport | null {
  const at = reportTimestamps.get(key);
  if (at === undefined) return null;
  if (Date.now() - at > REPORT_CACHE_TTL_MS) {
    reportTimestamps.delete(key);
    reportCache.delete(key);
    return null;
  }
  return reportCache.get(key) ?? null;
}

function storeReport(key: string, report: SecurityReport): SecurityReport {
  reportCache.set(key, report);
  reportTimestamps.set(key, Date.now());
  return report;
}

/** Drop the cached report for a guild (after config changes) so the next read reflects them. */
export function invalidateSecurityCache(guildId: string): void {
  reportCache.delete(guildId);
  reportTimestamps.delete(guildId);
}

/**
 * Compute the Security Strength percentage using weighted checks. This is a
 * configuration-coverage score: it must never be presented as an absolute
 * "you are safe" guarantee. The dashboard distinguishes coverage from actual
 * protection effectiveness.
 *
 * When `persist` is true (the Security Overview page) a historical assessment
 * row is written. High-frequency callers (Overview/Summary lists) pass false
 * and rely on the short TTL cache.
 */
export async function computeSecurityReport(
  prisma: PrismaClient,
  guildId: string,
  persist = true,
): Promise<SecurityReport> {
  const cached = cachedReport(guildId);
  if (cached) return cached;

  const [security, autoModRules, autoModSettings, assessment] = await Promise.all([
    prisma.securitySettings.findUnique({ where: { guildId } }),
    prisma.autoModRule.findMany({ where: { guildId } }),
    prisma.autoModSettings.findUnique({ where: { guildId } }),
    prisma.configBackup.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const antiRaid = security?.antiRaidEnabled ?? false;
  const antiNuke = security?.antiNukeEnabled ?? false;
  const antiSpam = security?.antiSpamEnabled ?? false;
  const permScan = security?.permissionScanEnabled ?? true;
  const trusted = (security?.trustedAdminIds ?? []).length;
  const hasBackup = Boolean(assessment);

  // Sub-checks with their own partial credit
  const checks: SecurityCheckResult[] = [
    {
      key: 'anti_raid',
      label: 'Anti-Raid',
      covered: antiRaid,
      score: antiRaid ? 1 : 0,
      weight: WEIGHTS.anti_raid,
      weakness: !antiRaid ? 'Anti-Raid is disabled' : undefined,
    },
    {
      key: 'anti_nuke',
      label: 'Anti-Nuke',
      covered: antiNuke,
      score: antiNuke ? 1 : 0,
      weight: WEIGHTS.anti_nuke,
      weakness: !antiNuke ? 'Anti-Nuke is disabled' : undefined,
    },
    {
      key: 'anti_spam',
      label: 'Anti-Spam',
      // Anti-spam may live on either the SecuritySettings switch or AutoMod rules
      covered: antiSpam || autoModRules.length > 0,
      score: antiSpam || autoModRules.length > 0 ? Math.min(1, 0.6 + autoModRules.length * 0.1) : 0,
      weight: WEIGHTS.anti_spam,
      weakness: !antiSpam && autoModRules.length === 0 ? 'No spam protections configured' : undefined,
    },
    {
      key: 'permission_security',
      label: 'Permission Security',
      covered: permScan,
      score: permScan ? 1 : 0,
      weight: WEIGHTS.permission_security,
      weakness: !permScan ? 'Permission scanning is disabled' : undefined,
    },
    {
      key: 'trusted_admins',
      label: 'Trusted Administrators',
      covered: trusted > 0,
      score: Math.min(1, trusted / 3),
      weight: WEIGHTS.trusted_admins,
      weakness: trusted === 0 ? 'No trusted administrators configured — protective responses may affect staff' : undefined,
    },
    {
      key: 'emergency_recovery',
      label: 'Emergency Recovery',
      covered: hasBackup,
      score: hasBackup ? 1 : 0,
      weight: WEIGHTS.emergency_recovery,
      weakness: !hasBackup ? 'No configuration backup exists' : undefined,
    },
  ];

  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const weighted = checks.reduce((acc, c) => acc + c.score * c.weight, 0);
  const score = Math.round((weighted / totalWeight) * 100);

  const enabled = checks.filter((c) => c.covered).map((c) => c.label);
  const disabled = checks.filter((c) => !c.covered).map((c) => c.label);
  const recommendations = checks
    .filter((c) => !c.covered || c.score < 1)
    .map((c) => c.weakness ?? `Improve ${c.label} configuration`);

  // Record a historical assessment only when the caller asked for it
  // (Security Overview). Overview/Summary lists pass false to avoid a write
  // per page load; they still get the same weighted number from the cache.
  if (persist) {
    await prisma.securityAssessment.create({
      data: {
        guildId,
        score,
        breakdown: {
          checks,
          enabled,
          disabled,
          recommendations,
        } as object,
      },
    });
  }

  return storeReport(guildId, {
    score,
    checks,
    enabled,
    disabled,
    recommendations,
    assessedAt: new Date().toISOString(),
  });
}

export type AutoModRuleKind =
  | 'spam'
  | 'repeated_message'
  | 'mention_spam'
  | 'suspicious_link'
  | 'invite_filter'
  | 'word_filter'
  | 'attachment_flood'
  | 'raid_behavior';

/** Default rule presets offered in the AutoMod UI. */
export const DEFAULT_AUTOMOD_PRESETS: { kind: AutoModRuleKind; name: string; config: Record<string, unknown>; action: string }[] = [
  { kind: 'spam', name: 'Spam Burst', config: { maxMessages: 5, windowSeconds: 5 }, action: 'warn' },
  { kind: 'repeated_message', name: 'Repeated Message', config: { maxRepeats: 3 }, action: 'warn' },
  { kind: 'mention_spam', name: 'Mention Spam', config: { maxMentions: 4 }, action: 'timeout' },
  { kind: 'suspicious_link', name: 'Suspicious Links', config: { blockedDomains: [] }, action: 'delete' },
  { kind: 'invite_filter', name: 'Invite Filter', config: { allowOwnGuild: true }, action: 'delete' },
  { kind: 'word_filter', name: 'Word Filter', config: { blockedWords: [] }, action: 'delete' },
  { kind: 'attachment_flood', name: 'Attachment Flood', config: { maxAttachments: 5 }, action: 'delete' },
  { kind: 'raid_behavior', name: 'Raid Behavior', config: { suspiciousAccountAgeDays: 1 }, action: 'timeout' },
];