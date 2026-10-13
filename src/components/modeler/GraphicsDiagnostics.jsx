import { useState } from 'react';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { diagnosticsToText } from '@/lib/glDiagnostics';

// Shown instead of a blank viewport when the 3D view can't start on this device.
// Lists the exact GPU / driver details so the failing hardware is identifiable.
export default function GraphicsDiagnostics({ lines }) {
  const [copied, setCopied] = useState(false);
  if (!lines || lines.length === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsToText(lines));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="absolute inset-0 z-40 overflow-auto bg-black/95 px-4 pb-4 pt-16 text-white">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
        <div className="flex-1">
          <p className="font-bold">3D view couldn't start on this device</p>
          <p className="opacity-70">Send these details so the problem can be traced.</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1 rounded-md border border-white/20 px-2 py-1">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-4 space-y-2 font-mono break-words">
        {lines.map((l, i) => (
          <div key={i}>
            <span className="opacity-60">{l.label}: </span>
            <span>{l.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}