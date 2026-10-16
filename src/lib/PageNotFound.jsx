import { Link, useLocation } from 'react-router-dom';

export default function PageNotFound() {
  const { pathname } = useLocation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-6xl font-light">404</h1>
        <h2 className="text-xl font-medium">Page not found</h2>
        <p className="text-sm text-muted-foreground">No page exists at {pathname}.</p>
        <Link to="/library" className="inline-block rounded-lg border border-border px-4 py-2 text-sm">My Models</Link>
      </div>
    </main>
  );
}
