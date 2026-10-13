import PublicPageShell from '@/components/public/PublicPageShell';
import ContactForm from '@/components/public/ContactForm';

export default function Contact() {
  return (
    <PublicPageShell>
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-muted-foreground">Contact</p>
      <h1 className="mb-6 text-4xl font-bold tracking-wide md:text-5xl">Contact AXIS 3D</h1>
      <div className="space-y-5 text-lg leading-8 text-muted-foreground">
        <p>
          Have questions about AXIS 3D, mobile modeling workflows, support, feedback, or future features? Reach out using the contact method below.
        </p>
        <ContactForm />
      </div>
    </PublicPageShell>
  );
}