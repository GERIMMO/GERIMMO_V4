"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { House, Pencil } from "lucide-react";
import styles from "./fiche-lot.module.css";
import { Button } from "@/components/ui/button";
import { formaterSurface } from "@/lib/parc";
import { FormulaireLot, type LotFormulaire } from "./formulaire-lot";

const MODIFIER_LOT = "gerimmo:modifier-lot";

/** Le même lien peut rouvrir le formulaire après un retour au résumé. */
export function LienModifierLot({ href, lotId }: { href: string; lotId: string }) {
  return <Link className="btn-secondaire" href={href} onNavigate={() => {
    window.dispatchEvent(new CustomEvent(MODIFIER_LOT, { detail: lotId }));
  }}><Pencil size={15} aria-hidden="true" />Modifier le lot</Link>;
}

export function RecapLot({ orgId, bienId, lot, verrouille, copropriete, typeBien, modifierInitial = false, lectureSeule = false, titre = "Caractéristiques du logement", faits, boutonModifier = true }: {
  orgId: string;
  bienId: string;
  lot: LotFormulaire;
  verrouille: boolean;
  copropriete?: boolean | null;
  typeBien?: string;
  modifierInitial?: boolean;
  lectureSeule?: boolean;
  titre?: string;
  boutonModifier?: boolean;
  faits?: ReactNode;
}) {
  const [modifier, setModifier] = useState(modifierInitial);
  const formulaireId = useId();
  useEffect(() => {
    const ouvrir = (event: Event) => {
      if (!lectureSeule && event instanceof CustomEvent && event.detail === lot.id) setModifier(true);
    };
    window.addEventListener(MODIFIER_LOT, ouvrir);
    return () => window.removeEventListener(MODIFIER_LOT, ouvrir);
  }, [lot.id, lectureSeule]);
  const edition = modifier && !lectureSeule;
  const groupes = [
    {
      titre: "Équipements et surfaces",
      details: [
        { libelle: "Chauffage", valeur: lot.chauffage },
        { libelle: "Eau chaude", valeur: lot.eau_chaude },
        { libelle: "Surface Carrez", valeur: lot.surface_carrez != null ? formaterSurface(lot.surface_carrez) : null },
      ],
    },
    {
      titre: "Annexes",
      details: [
        { libelle: "Locaux privatifs", valeur: lot.locaux_privatifs },
        { libelle: "Autres parties du logement", valeur: lot.description },
      ],
    },
    {
      titre: "Références",
      details: [
        { libelle: "Identifiant fiscal", valeur: lot.identifiant_fiscal },
        ...(copropriete !== false ? [{ libelle: "Tantièmes de copropriété", valeur: lot.tantieme != null ? String(lot.tantieme) : null }] : []),
      ],
    },
  ].map(groupe => ({
    ...groupe,
    details: groupe.details.filter(detail => detail.valeur?.trim()),
  })).filter(groupe => groupe.details.length > 0);

  return <div className={styles.recap}>
    <div className={styles.recapEntete}>
      <h2>{faits && <span className={styles.panneauIcone}><House size={18} aria-hidden="true" /></span>}{titre}</h2>
      {!lectureSeule && (boutonModifier || edition) && <Button type="button" variant="outline" size="sm" aria-expanded={edition} aria-controls={formulaireId} onClick={() => setModifier(v => !v)}>
        <Pencil size={14} aria-hidden="true" />{edition ? "Revenir au résumé" : groupes.length > 0 ? "Modifier" : "Compléter"}
      </Button>}
    </div>
    <div hidden={edition}>
      {faits}
      {groupes.length > 0 ? <div className={styles.recapGroupes}>
        {groupes.map(groupe => <section className={styles.recapGroupe} key={groupe.titre}>
          <h3 className={styles.recapGroupeTitre}>{groupe.titre}</h3>
          <dl className={styles.recapDetails}>
            {groupe.details.map(detail => <div key={detail.libelle}><dt>{detail.libelle}</dt><dd>{detail.valeur}</dd></div>)}
          </dl>
        </section>)}
      </div> : !faits ? <p className={styles.recapVide}>Aucun détail complémentaire renseigné.</p> : null}
    </div>
    {/* Garder le formulaire monté préserve les saisies lors d’un aller-retour au résumé. */}
    {!lectureSeule && <div id={formulaireId} hidden={!edition} className="space-y-3">
      {verrouille && <p className="text-xs text-warning-soft-foreground">Lot loué : surface et pièces verrouillées, modification par avenant au bail.</p>}
      <FormulaireLot orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={copropriete} typeBien={typeBien} />
    </div>}
  </div>;
}
