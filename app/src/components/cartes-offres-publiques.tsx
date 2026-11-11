"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { euros, montantAbonnementUnique, type Periodicite } from "@/lib/tarifs";

export function CartesOffresPubliques() {
  const id = useId();
  const [biens, setBiens] = useState(1);
  const [periode, setPeriode] = useState<Periodicite>("mensuel");
  const mensuel = montantAbonnementUnique(biens, "mensuel");
  const annuel = montantAbonnementUnique(biens, "annuel");
  return (
    <section className="offre-publique mx-auto max-w-2xl" aria-label="Simuler mon abonnement">
      <label htmlFor={id} className="offre-nom">Nombre de biens <strong>{biens}</strong></label>
      <input id={id} className="my-4 block w-full" type="range" min={1} max={100} value={biens}
        onChange={(e) => setBiens(Number(e.target.value))} />
      <div className="offres-choix" role="group" aria-label="Rythme de paiement">
        <button type="button" aria-pressed={periode === "mensuel"} onClick={() => setPeriode("mensuel")}>Mensuel</button>
        <button type="button" aria-pressed={periode === "annuel"} onClick={() => setPeriode("annuel")}>Annuel</button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        <p className="offre-prix">{euros(periode === "mensuel" ? mensuel : annuel)}
          <small>{periode === "mensuel" ? " par mois" : " en une fois par an"}</small>
        </p>
        <p>{euros(mensuel)} par mois ou {euros(annuel)} par an. Le paiement annuel économise {euros(12 * mensuel - annuel)}.</p>
      </div>
      <p className="my-4">Premier bien à 5,99 €. Du 2ᵉ au 7ᵉ, ajoutez 1,99 € par bien. De 8 à 20 biens, le total est de 19,90 €. Chaque bien au-delà de 20 ajoute 0,99 € par mois.</p>
      <Link href="/inscription" className="btn-secondaire">Commencer mon essai gratuit</Link>
    </section>
  );
}
