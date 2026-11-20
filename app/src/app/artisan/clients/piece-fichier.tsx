"use client";

import { useId } from "react";
import { ChampFichier } from "@/components/champ-fichier";
import { CLASSE_LIBELLE } from "../ui";

export function PieceFichier({ label, photo, required }: { label: string; photo: boolean; required: boolean }) {
  const id = useId();
  return <div className="space-y-1.5"><label htmlFor={id} className={CLASSE_LIBELLE}>{label} — 10 Mo maximum</label><ChampFichier depotDirect id={id} name="fichier" accept={photo ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"} required={required}/></div>;
}
