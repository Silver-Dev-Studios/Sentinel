import { SecurityFeaturePage } from './SecurityFeaturePage';

export function AutoSpamPage() {
  return (
    <SecurityFeaturePage
      title="Anti-Spam"
      description="Detect repeated messages, excessive mentions, suspicious links, and rapid message bursts with configurable escalation."
      feature="antiSpam"
      fields={[
        { key: 'antiSpamMaxMessages', label: 'Max messages per window', type: 'number' },
        { key: 'antiSpamWindowSeconds', label: 'Detection window (seconds)', type: 'number' },
        { key: 'antiSpamMaxMentions', label: 'Max mentions per message', type: 'number' },
        {
          key: 'antiSpamEscalation',
          label: 'Escalation',
          type: 'select',
          options: ['warn', 'delete', 'timeout', 'kick'],
        },
        { key: 'antiSpamTimeoutSeconds', label: 'Timeout duration (seconds)', type: 'number' },
      ]}
    />
  );
}