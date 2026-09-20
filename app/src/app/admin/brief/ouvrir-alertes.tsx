"use client";

import type { ReactNode } from "react";

export function OuvrirAlertes({ children, className }: { children: ReactNode; className: string }) {
  return (
    <button
      type="button"
      className={`${className} w-full text-left`}
      onClick={() => window.dispatchEvent(new Event("gerimmo:ouvrir-alertes"))}
    >
      {children}
    </button>
  );
}
