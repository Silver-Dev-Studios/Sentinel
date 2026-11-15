import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Menu, Shield, X } from 'lucide-react';
import { NAV_SECTIONS } from '../nav';
import { useAuth } from '../lib/auth';
import { useServer } from '../lib/server';

function Emblem({ size = 26 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sentinel-accent to-sentinel-indigo text-white"
      style={{ width: size + 6, height: size + 6 }}
    >
      <Shield style={{ width: size, height: size }} />
    </div>
  );
}

function ServerSwitcher() {
  const { servers, selectedGuildId, selectServer } = useServer();
  const [open, setOpen] = useState(false);
  const selected = servers.find((s) => s.id === selectedGuildId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-sentinel-border bg-sentinel-surface px-3 py-2 text-left text-sm hover:bg-sentinel-border/30"
      >
        {selected?.icon ? (
          <img src={`https://cdn.discordapp.com/icons/${selected.id}/${selected.icon}.png?size=64`} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sentinel-accent/40 text-xs">{selected?.name?.charAt(0) ?? '?'}</div>
        )}
        <span className="flex-1 truncate font-medium text-sentinel-text">{selected?.name ?? 'Select server'}</span>
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-sentinel-border bg-sentinel-surface shadow-xl">
          {servers.length === 0 ? (
            <div className="p-3 text-xs text-sentinel-muted">No servers available</div>
          ) : (
            servers.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  selectServer(s.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sentinel-surface2 ${
                  s.id === selectedGuildId ? 'bg-sentinel-accent/15 text-sentinel-text' : 'text-sentinel-muted'
                }`}
              >
                {s.icon ? (
                  <img src={`https://cdn.discordapp.com/icons/${s.id}/${s.icon}.png?size=64`} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sentinel-accent/40 text-[10px]">{s.name?.charAt(0) ?? '?'}</div>
                )}
                <span className="truncate">{s.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initials = useMemo(() => {
    if (!user?.username) return '?';
    return user.username.slice(0, 2).toUpperCase();
  }, [user]);

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest text-sentinel-muted">
            {section.title}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                      isActive
                        ? 'bg-gradient-to-r from-sentinel-accent/25 to-sentinel-indigo/15 text-white'
                        : 'text-sentinel-muted hover:bg-sentinel-surface2 hover:text-sentinel-text'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sentinel-border bg-sentinel-surface/60 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Emblem />
          <div>
            <div className="text-lg font-bold tracking-tight text-white">
              SDS <span className="text-sentinel-accent2">Sentinel</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-sentinel-muted">Internal Platform</div>
          </div>
        </div>
        <div className="px-3 pb-4">
          <ServerSwitcher />
        </div>
        {nav}
        <div className="border-t border-sentinel-border p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sentinel-accent/30 text-xs font-bold">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-sentinel-text">{user?.username}</div>
              <div className="text-[11px] text-sentinel-muted">{user?.admin ? 'Administrator' : 'User'}</div>
            </div>
            <button onClick={() => void logout()} title="Sign out" className="text-sentinel-muted hover:text-sentinel-text">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-sentinel-border bg-sentinel-surface/60 px-4 py-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-sentinel-muted">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Emblem size={20} />
            <span className="font-semibold text-white">SDS Sentinel</span>
          </div>
        </header>
        {sidebarOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="flex w-72 flex-col bg-sentinel-surface">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <Emblem size={20} />
                  <span className="font-bold text-white">SDS Sentinel</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="text-sentinel-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-3 pb-2">
                <ServerSwitcher />
              </div>
              {nav}
            </div>
            <div className="flex-1 bg-black/60" onClick={() => setSidebarOpen(false)} />
          </div>
        ) : null}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}