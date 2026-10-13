import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// No account needed: guests go straight into the modeler.
export default function GuestContinue() {
  return (
    <Link
      to="/library"
      className="mt-6 flex items-center justify-center gap-2 w-full h-12 rounded-md border border-sky-400/30 text-sm font-medium text-sky-100 hover:bg-sky-500/10"
    >
      Continue as guest
      <ArrowRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  );
}