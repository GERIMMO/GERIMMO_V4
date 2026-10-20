"use client";

import { useId } from "react";
import { ChampFichier } from "@/components/champ-fichier";

export function PieceFichier({ label, photo, required }: { label: string; photo: boolean; required: boolean }) {
  const id = useId();
  return <div className="space-y-1"><label htmlFor={id}>{label} — 4 Mo maximum</label><ChampFichier id={id} name="fichier" accept={photo ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"} required={required}/></div>;
}
