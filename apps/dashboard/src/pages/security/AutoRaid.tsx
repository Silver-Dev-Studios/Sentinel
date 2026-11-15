import { SecurityFeaturePage } from './SecurityFeaturePage';

export function AutoRaidPage() {
  return (
    <SecurityFeaturePage
      title="Anti-Raid"
      description="Detect unusual join-rate patterns and suspicious new accounts, alert administrators, and respond protectively."
      feature="antiRaid"
      assessments
      fields={[
        { key: 'antiRaidJoinThreshold', label: 'Join threshold per window', type: 'number' },
        { key: 'antiRaidWindowSeconds', label: 'Detection window (seconds)', type: 'number' },
        { key: 'antiRaidAccountAgeSeconds', label: 'Minimum account age to ignore (seconds)', type: 'number' },
        {
          key: 'antiRaidResponse',
          label: 'Response',
          type: 'select',
          options: ['alert', 'lockdown', 'disable_joins'],
        },
      ]}
    />
  );
}