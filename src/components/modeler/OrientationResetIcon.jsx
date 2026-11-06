import { Axis3d } from 'lucide-react';

// Icon of the Orientation reset button (left side, and in Help).
export default function OrientationResetIcon({ className = '' }) {
  return <Axis3d className={className} strokeWidth={2} aria-hidden="true" />;
}
