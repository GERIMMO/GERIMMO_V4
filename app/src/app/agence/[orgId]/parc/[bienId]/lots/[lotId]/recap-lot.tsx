"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import styles from "./fiche-lot.module.css";
import { Button } from "@/components/ui/button";
import { formaterSurface } from "@/lib/parc";
import { FormulaireLot, type LotFormulaire } from "./formulaire-lot";

export function RecapLot({ orgId, bienId, lot, verrouille, copropriete, typeBien, modifierInitial = false }: {
  orgId: string;
  bienId: string;
  lot: LotFormulaire;
  verrouille: boolean;
  copropriete?: boolean | null;
  typeBien?: string;
  modifierInitial?: boolean;
}) {
  const [modifier, setModifier] = useState(modifierInitial);
  const details = [
    { libelle: "Surface Carrez", valeur: lot.surface_carrez != null ? formaterSurface(lot.surface_carrez) : null },
    { libelle: "Identifiant fiscal", valeur: lot.identifiant_fiscal },
    ...(copropriete !== false ? [{ libelle: "Tantième de copropriété", valeur: lot.tantieme != null ? String(lot.tantieme) : null }] : []),
    { libelle: "Chauffage", valeur: lot.chauffage },
    { libelle: "Eau chaude", valeur: lot.eau_chaude },
    { libelle: "Locaux privatifs", valeur: lot.locaux_privatifs },
  ];
  return <div className={styles.recap}>
    <div className={styles.recapEntete}><div><h2>Caractéristiques du logement</h2></div><Button type="button" variant="outline" size="sm" aria-expanded={modifier} onClick={() => setModifier(v => !v)}><Pencil size={14} aria-hidden="true" />{modifier ? "Revenir au résumé" : "Modifier"}</Button></div>
    <div hidden={modifier}>
      <dl className={styles.details}>{details.filter(f => f.valeur != null && f.valeur !== "").map(f => <div key={f.libelle}><dt>{f.libelle}</dt><dd>{f.valeur}</dd></div>)}</dl>
      {lot.description && <div className={styles.description}><span>Autres parties du logement</span><p>{lot.description}</p></div>}
    </div>
    {/* Garder le formulaire monté préserve les saisies lors d’un aller-retour au résumé. */}
    <div hidden={!modifier} className="space-y-3">
      {verrouille && <p className="text-xs text-warning-soft-foreground">Lot loué : surface et pièces verrouillées, modification par avenant au bail.</p>}
      <FormulaireLot orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={copropriete} typeBien={typeBien} />
    </div>
  </div>;
}
