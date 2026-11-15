import { SecurityFeaturePage } from './SecurityFeaturePage';

export function AutoNukePage() {
  return (
    <SecurityFeaturePage
      title="Anti-Nuke"
      description="Monitor destructive administrative activity such as channel/role deletion, unusual bans, and permission changes."
      feature="antiNuke"
      fields={[
        { key: 'antiNukeChannelDeleteThreshold', label: 'Channel delete threshold', type: 'number' },
        { key: 'antiNukeRoleDeleteThreshold', label: 'Role delete threshold', type: 'number' },
        { key: 'antiNukeBanThreshold', label: 'Ban threshold', type: 'number' },
        { key: 'antiNukeWindowSeconds', label: 'Detection window (seconds)', type: 'number' },
        {
          key: 'antiNukeResponse',
          label: 'Response',
          type: 'select',
          options: ['alert', 'lockdown'],
        },
      ]}
    />
  );
}