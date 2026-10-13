import PublicPageShell from '@/components/public/PublicPageShell';

export default function About() {
  return (
    <PublicPageShell>
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-muted-foreground">About the app</p>
      <h1 className="mb-6 text-4xl font-bold tracking-wide md:text-5xl">About AXIS 3D</h1>
      <div className="space-y-5 text-lg leading-8 text-muted-foreground">
        <p>
          AXIS 3D is a mobile-first 3D modeling environment built for creators who want serious modeling tools without being tied to a desktop workstation. The app focuses on intuitive, context-aware finger gestures that let users sculpt, select, transform, paint, refine, and export geometry directly from a phone or tablet. It brings together object, face, edge, and vertex editing with touch-friendly panels, precision controls, material tools, lighting controls, project storage, and export workflows designed for fast iteration.
        </p>
        <p>
          AXIS 3D is for artists, designers, students, indie developers, hobbyists, makers, and anyone who wants to shape ideas in three dimensions while away from a traditional computer setup. It is especially useful for quick concept modeling, blocking out assets, studying form, experimenting with surface treatments, or preparing geometry for further work in other creative pipelines. The interface is designed around direct manipulation, so tools stay close to the viewport and respond to the object or component being edited.
        </p>
        <p>
          AXIS 3D is a First App Production, built with the goal of making powerful 3D creation feel natural on modern touch devices. The project continues to grow around practical modeling needs, mobile usability, and workflows inspired by established 3D software while adapting them for a faster handheld experience.
        </p>
      </div>
    </PublicPageShell>
  );
}