import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl font-extrabold text-sentinel-accent2">404</div>
      <p className="mt-3 text-sentinel-muted">This page does not exist.</p>
      <Link to="/" className="mt-6 text-sm font-medium text-sentinel-accent2 hover:underline">
        Back to Overview
      </Link>
    </div>
  );
}