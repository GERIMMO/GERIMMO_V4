"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { FORMULES_PARTICULIER, SUPPLEMENT_BIEN_CENTS, euros, etiquetteTaxes, type Periodicite } from "@/lib/tarifs";
import { REGIME_TVA } from "@/lib/editeur";

/** Présentation publique ; les montants viennent du même barème que l’abonnement. */
export function CartesOffresPubliques() {
  const [periode, setPeriode] = useState<Periodicite>("mensuel");
  const taxe = etiquetteTaxes("ttc", REGIME_TVA);
  return (
    <div className="offres-publiques">
      <div className="offres-choix" role="group" aria-label="Périodicité des tarifs">
        <button type="button" aria-pressed={periode === "mensuel"} onClick={() => setPeriode("mensuel")}>Mensuel</button>
        <button type="button" aria-pressed={periode === "annuel"} onClick={() => setPeriode("annuel")}>Annuel <span>2 mois offerts</span></button>
      </div>
      <div className="offres-grille" aria-live="polite" aria-atomic="true">
        {FORMULES_PARTICULIER.map((offre) => (
          <article key={offre.code} className="offre-publique">
            <p className="offre-nom">{offre.nom}</p>
            <p className="offre-biens">{offre.biens === 1 ? "Pour votre premier bien" : `Jusqu’à ${offre.biens} biens`}</p>
            <p className="offre-prix">{euros(periode === "mensuel" ? offre.mensuelCents : offre.annuelCents)}<small>{taxe ? `${taxe} ` : ""}/ {periode === "mensuel" ? "mois" : "an"}</small></p>
            <p className="offre-periode">{periode === "mensuel" ? "Sans engagement" : "Prélevé en une fois pour 12 mois"}</p>
            <ul>
              <li><Check aria-hidden size={16} /> Toutes les fonctions de gestion</li>
              <li><Check aria-hidden size={16} /> Espace locataire inclus</li>
            </ul>
            <Link href="/inscription" className="btn-secondaire">Créer mon compte <ArrowUpRight aria-hidden size={16} /></Link>
          </article>
        ))}
      </div>
      <p className="offres-note">Au-delà de 20 biens : formule Patrimoine + {euros(SUPPLEMENT_BIEN_CENTS[periode])} par bien supplémentaire et par {periode === "mensuel" ? "mois" : "an"}. L’essai gratuit précède tout abonnement payant.</p>
    </div>
  );
}
