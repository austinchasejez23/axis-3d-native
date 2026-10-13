import { Link } from 'react-router-dom';

export default function PublicPageShell({ children }) {
  return (
    <main className="axis-library min-h-screen bg-background text-foreground font-body">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 text-sm uppercase tracking-[0.28em] text-muted-foreground">
        <Link to="/" className="font-bold text-foreground">AXIS 3D</Link>
        <div className="flex items-center gap-5">
          <Link to="/about" className="hover:text-foreground">About</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
        </div>
      </nav>
      <section className="mx-auto w-full max-w-4xl px-5 pb-16 pt-12">
        <div className="rounded-2xl border border-border bg-card p-7 md:p-10">
          {children}
        </div>
      </section>
    </main>
  );
}