import {
  Activity,
  AlertTriangle,
  Bot,
  Boxes,
  CalendarDays,
  Command,
  ClipboardList,
  Clock,
  Database,
  FileClock,
  Gauge,
  Gift,
  LayoutDashboard,
  ListChecks,
  Lock,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  PanelTop,
  PieChart,
  Puzzle,
  ScrollText,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Ticket,
  UserCog,
  UserPlus,
  Users,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'General',
    items: [
      { label: 'Overview', path: '/', icon: LayoutDashboard },
      { label: 'Server Selector', path: '/servers', icon: Server },
      { label: 'Live Monitoring', path: '/monitoring', icon: Activity },
      { label: 'Analytics', path: '/analytics', icon: PieChart },
    ],
  },
  {
    title: 'Moderation',
    items: [
      { label: 'Moderation Center', path: '/moderation', icon: Shield },
      { label: 'AutoMod', path: '/automod', icon: Zap },
      { label: 'Quick Actions', path: '/moderation/quick-actions', icon: Gauge },
      { label: 'Moderation Roles', path: '/moderation/roles', icon: UserCog },
      { label: 'Moderation Logs', path: '/moderation/logs', icon: ScrollText },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Message Builder', path: '/messages', icon: MessagesSquare },
      { label: 'Event Builder', path: '/events', icon: CalendarDays },
      { label: 'Ticket System', path: '/tickets', icon: Ticket },
      { label: 'Giveaways', path: '/giveaways', icon: Gift },
      { label: 'Custom Commands', path: '/commands', icon: Command },
      { label: 'Scheduler', path: '/scheduler', icon: Clock },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Security Overview', path: '/security', icon: ShieldCheck },
      { label: 'Anti-Raid', path: '/security/anti-raid', icon: ShieldAlert },
      { label: 'Anti-Nuke', path: '/security/anti-nuke', icon: ShieldX },
      { label: 'Anti-Spam', path: '/security/anti-spam', icon: XCircle },
      { label: 'Permission Security', path: '/security/permissions', icon: Lock },
      { label: 'Configuration Backups', path: '/security/backups', icon: Database },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Alert Center', path: '/alerts', icon: AlertTriangle },
      { label: 'Audit Center', path: '/audit', icon: FileClock },
      { label: 'Diagnostics', path: '/diagnostics', icon: Bot },
      { label: 'Settings', path: '/settings', icon: Settings2 },
    ],
  },
];

export { Activity, Boxes, ClipboardList, ListChecks, Megaphone, MessageSquare, PanelTop, Puzzle, UserPlus, Users };