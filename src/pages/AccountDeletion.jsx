import { CheckCircle2, ShieldCheck } from 'lucide-react';

const steps = ['Open AXIS 3D', 'Go to Library and log in', 'Open Menu, then Account', 'Select Delete account and confirm'];

export default function AccountDeletion() {
  return (
    <main className="min-h-screen bg-[#080b10] px-5 py-10 text-slate-100 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 border-b border-sky-400/20 pb-7">
          <div className="mb-4 flex items-center gap-3 text-sky-400">
            <ShieldCheck className="h-8 w-8" aria-hidden="true" />
            <span className="text-sm font-bold uppercase tracking-[0.22em]">AXIS 3D</span>
          </div>
          <h1 className="font-heading text-4xl font-bold tracking-tight">Delete your AXIS 3D account</h1>
          <p className="mt-3 text-base leading-7 text-slate-300">You can permanently delete your account and associated app data from inside AXIS 3D.</p>
        </header>

        <section className="mb-8 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
          <h2 className="mb-5 text-xl font-bold">Steps to request deletion</h2>
          <ol className="space-y-4">
            {steps.map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400 font-bold text-slate-950">{index + 1}</span><span className="pt-1 text-base text-slate-200">{step}</span></li>)}
          </ol>
        </section>

        <section className="space-y-6">
          <div><h2 className="mb-3 text-xl font-bold">Data permanently deleted</h2><ul className="space-y-2 text-slate-300">{['Your AXIS 3D account and app account fields', 'Local AXIS 3D project copies on the device', 'Cloud backup records associated with your account', 'Stored Google access connected to AXIS 3D', 'Stripe customer and subscription data, where Stripe permits deletion'].map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" aria-hidden="true" /><span>{item}</span></li>)}</ul></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h2 className="mb-2 text-xl font-bold">Data that may be kept</h2><p className="leading-7 text-slate-300">Stripe may retain legally required transaction records for the period required by applicable financial, tax, fraud-prevention, and regulatory obligations. AXIS 3D does not keep a separate copy of those retained Stripe records.</p></div>
          <p className="border-t border-white/10 pt-6 text-sm leading-6 text-slate-400">Account deletion is permanent and cannot be undone. Google account access is revoked as part of the deletion process. Hosted backup files may remain in provider storage after their AXIS backup records are deleted.</p>
        </section>
      </div>
    </main>
  );
}