"use client";

import { createContext, useState, type ReactNode } from "react";

export const SignalerDecisionArtisan = createContext<(message: string) => void>(() => {});

export function RetourDecisionsArtisan({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return <SignalerDecisionArtisan.Provider value={setMessage}>
    {message && <div role="status" className="mx-auto mt-4 w-full max-w-4xl border-l-2 border-[var(--success)] bg-[var(--ivoire)] px-4 py-3 text-sm text-[var(--success)] sm:px-7">{message}</div>}
    {children}
  </SignalerDecisionArtisan.Provider>;
}
