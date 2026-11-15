import { Shield } from 'lucide-react';

export function LoginPage() {
  const loginUrl = `${import.meta.env.VITE_API_URL ?? ''}/api/auth/login`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sentinel-bg px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sentinel-accent to-sentinel-indigo text-white shadow-glow">
        <Shield className="h-9 w-9" />
      </div>
      <h1 className="mt-6 text-3xl font-bold text-white">
        SDS <span className="text-sentinel-accent2">Sentinel</span>
      </h1>
      <p className="mt-2 max-w-sm text-center text-sm text-sentinel-muted">
        Internal server monitoring, moderation, and security platform for Silver Dev Studios.
      </p>
      <a
        href={loginUrl}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sentinel-accent to-sentinel-indigo px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        Sign in with Discord
      </a>
    </div>
  );
}