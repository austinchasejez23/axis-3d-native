import React from "react";
import { Image } from "@/components/ui/image";

export default function AuthLayout({ icon: Icon, logoUrl, title, subtitle, footer, children, compact = false }) {
  return (
    <div className={`min-h-screen flex items-center justify-center bg-black ${compact ? 'p-0' : 'px-3'}`}>
      <div className="w-full max-w-md" style={{ zoom: 'var(--axis-auth-scale, 1)' }}>
        <div className={`text-center ${compact ? 'mb-2' : 'mb-7'}`}>
          {logoUrl ? (
            <div className={`mx-auto overflow-hidden ${compact ? 'h-24 w-full' : 'w-144 h-40'}`}>
              <Image src={logoUrl} alt="AXIS 3D" className={`w-full ${compact ? 'h-32 -translate-y-4' : 'h-72 -translate-y-16'}`} fittingType="fit" loading="eager" fetchPriority="high" />
            </div>
          ) : (
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/40 mb-4"
              style={{ boxShadow: "0 0 24px 2px rgba(56,189,248,0.25)" }}
            >
              <Icon className="w-7 h-7 text-sky-400" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-sky-200/60 mt-2">{subtitle}</p>}
        </div>
        <div className={`bg-[#0a0c10] rounded-2xl border border-sky-400/20 shadow-[0_0_40px_-10px_rgba(56,189,248,0.35)] ${compact ? 'p-4' : 'p-8'}`}>
          {children}
        </div>
        {footer && (
          <p className={`text-center text-sm text-sky-200/60 ${compact ? 'mt-2' : 'mt-6'}`}>{footer}</p>
        )}
      </div>
    </div>
  );
}