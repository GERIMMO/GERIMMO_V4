"use client";

import { useState } from "react";
import { Ruler, DoorOpen, Layers, Sofa, Pencil } from "lucide-react";
import styles from "./fiche-lot.module.css";
import { Button } from "@/components/ui/button";
import { formaterSurface } from "@/lib/parc";
import { FormulaireLot, type LotFormulaire } from "./formulaire-lot";

export function RecapLot({ orgId, bienId, lot, verrouille, copropriete, modifierInitial = false }: {
  orgId: string;
  bienId: string;
  lot: LotFormulaire;
  verrouille: boolean;
  copropriete?: boolean | null;
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
    <div className={styles.recapEntete}><div><h2>Caractéristiques du logement</h2><p>{modifier ? "Ces informations sont reprises dans le bail." : "Les informations enregistrées pour ce lot."}</p></div><Button type="button" variant="outline" size="sm" aria-expanded={modifier} onClick={() => setModifier(v => !v)}><Pencil size={14} aria-hidden="true" />{modifier ? "Revenir au résumé" : "Modifier"}</Button></div>
    <div hidden={modifier}>
      <dl className={styles.caracteristiques}>{[
        { libelle: "Surface", valeur: lot.surface_m2 != null ? formaterSurface(lot.surface_m2) : null, Icone: Ruler },
        { libelle: "Pièces", valeur: lot.pieces != null ? String(lot.pieces) : null, Icone: DoorOpen },
        { libelle: "Étage", valeur: lot.etage, Icone: Layers },
        { libelle: "Location", valeur: lot.meuble ? "Meublée" : "Non meublée", Icone: Sofa },
      ].map(({ libelle, valeur, Icone }) => <div key={libelle}><dt><Icone size={16} aria-hidden="true" />{libelle}</dt><dd className={!valeur ? styles.manquant : undefined}>{valeur || "À renseigner"}</dd></div>)}</dl>
      <dl className={styles.details}>{details.map(f => <div key={f.libelle}><dt>{f.libelle}</dt><dd>{f.valeur || "Non renseigné"}</dd></div>)}</dl>
      <div className={styles.description}><span>Autres parties du logement</span><p>{lot.description || "Non renseigné"}</p></div>
    </div>
    {/* Garder le formulaire monté préserve les saisies lors d’un aller-retour au résumé. */}
    <div hidden={!modifier} className="space-y-3">
      {verrouille && <p className="text-xs text-warning-soft-foreground">Lot loué : surface et pièces verrouillées, modification par avenant au bail.</p>}
      <FormulaireLot orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={copropriete} />
    </div>
  </div>;
}
