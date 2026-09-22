"use client";

import Image from "next/image";
import { useState } from "react";
import { MarqueGerimmo } from "./marque-gerimmo";
import { logoAffichable, type MarqueOrganisation as Marque } from "@/lib/marque-organisation";

export function MarqueOrganisation({ marque }: { marque?: Marque | null }) {
  const logo = logoAffichable(marque?.logo_url);
  const [echec, setEchec] = useState<string | null>(null);
  const nom = marque?.nom_portail?.trim() || marque?.name?.trim();
  if (logo && echec !== logo) return <Image src={logo} alt={nom || "Logo de l’agence"} width={180} height={44} unoptimized referrerPolicy="no-referrer" onError={() => setEchec(logo)} className="h-auto max-h-11 w-auto max-w-full object-contain" />;
  if (nom) return <span title={nom} className="block max-w-full truncate font-[family-name:var(--font-titres)] text-base font-bold tracking-wide text-[var(--encre)]">{nom}</span>;
  return <MarqueGerimmo />;
}
