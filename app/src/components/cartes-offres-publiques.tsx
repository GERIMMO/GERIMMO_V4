"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { euros, montantAbonnementUnique, type Periodicite } from "@/lib/tarifs";
import { AIDE_BOUTON_EN_ATTENTE, useHydrate } from "@/lib/use-hydrate";

export function CartesOffresPubliques() {
  const id = useId();
  const pret = useHydrate();
  const [biens, setBiens] = useState(1);
  const [saisie, setSaisie] = useState("1");
  const maxCurseur = 100;
  const maxSaisie = 1_000_000_000;
  const [periode, setPeriode] = useState<Periodicite>("mensuel");
  const mensuel = montantAbonnementUnique(biens, "mensuel");
  const annuel = montantAbonnementUnique(biens, "annuel");
  return (
    <section className="offre-publique mx-auto max-w-2xl" aria-label="Simuler mon abonnement">
      <label htmlFor={id} className="offre-nom">Nombre de biens <strong>{biens}</strong></label>
      <div className="my-4 flex items-center gap-4">
        <input id={id} className="min-w-0 flex-1" type="range" min={1} max={maxCurseur} value={Math.min(biens, maxCurseur)}
          disabled={!pret} title={pret ? undefined : AIDE_BOUTON_EN_ATTENTE}
          onChange={(e) => {
            const valeur = e.currentTarget.valueAsNumber;
            setBiens(valeur);
            setSaisie(String(valeur));
          }} />
        <input type="number" aria-label="Nombre exact de biens" min={1} max={maxSaisie} step={1}
          className="min-h-11 w-24 rounded-md border border-[var(--filet)] bg-[var(--surface)] px-2 text-base"
          disabled={!pret} title={pret ? undefined : AIDE_BOUTON_EN_ATTENTE} value={saisie}
          onChange={(e) => {
            const { value, valueAsNumber } = e.currentTarget;
            setSaisie(value);
            if (Number.isSafeInteger(valueAsNumber) && valueAsNumber >= 1 && valueAsNumber <= maxSaisie) {
              setBiens(valueAsNumber);
            }
          }}
          onBlur={() => setSaisie(String(biens))} />
      </div>
      <div className="offres-choix" role="group" aria-label="Rythme de paiement">
        <button type="button" disabled={!pret} title={pret ? undefined : AIDE_BOUTON_EN_ATTENTE} aria-pressed={periode === "mensuel"} onClick={() => setPeriode("mensuel")}>Mensuel</button>
        <button type="button" disabled={!pret} title={pret ? undefined : AIDE_BOUTON_EN_ATTENTE} aria-pressed={periode === "annuel"} onClick={() => setPeriode("annuel")}>Annuel</button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        <p className="offre-prix">{euros(periode === "mensuel" ? mensuel : annuel)}
          <small>{periode === "mensuel" ? " par mois" : " en une fois par an"}</small>
        </p>
        <p>{euros(mensuel)} par mois ou {euros(annuel)} par an. Le paiement annuel économise {euros(12 * mensuel - annuel)}.</p>
      </div>
      <p className="my-4">Chaque mois, le premier bien coûte {euros(montantAbonnementUnique(1, "mensuel"))}. Du 2ᵉ au 7ᵉ, ajoutez {euros(montantAbonnementUnique(2, "mensuel") - montantAbonnementUnique(1, "mensuel"))} par bien. De 8 à 20 biens, le total est de {euros(montantAbonnementUnique(8, "mensuel"))}. Chaque bien au-delà de 20 ajoute {euros(montantAbonnementUnique(21, "mensuel") - montantAbonnementUnique(20, "mensuel"))}.</p>
      <Link href="/inscription" className="btn-secondaire">Commencer mon essai gratuit</Link>
    </section>
  );
}
