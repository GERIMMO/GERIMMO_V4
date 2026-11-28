"use client";

import { useSelectedLayoutSegment } from "next/navigation";

export function BandeauEnvoisHorsAccueil({ message }: { message: string }) {
  const segment = useSelectedLayoutSegment();
  if (!segment) return null;
  return <p role="status" className="mx-4 my-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{message}</p>;
}
