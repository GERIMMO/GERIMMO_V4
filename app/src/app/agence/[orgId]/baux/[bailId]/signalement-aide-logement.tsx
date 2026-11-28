"use client";

import { useState } from "react";
import { formaterDate } from "@/lib/ged";
import { lireMontantFacultatif } from "@/lib/saisie-montant";
import { ENTREE_EN_VIGUEUR_IMPAYES, signalementAideLogement } from "@/lib/impaye-aide-logement";

function centimes(montant: string) {
  const lu = lireMontantFacultatif(montant);
  return "montant" in lu && lu.montant !== null ? Math.round(lu.montant * 100) : NaN;
}

export function SignalementAideLogement({ jour, versementCafConnu }: { jour: string; versementCafConnu: boolean }) {
  const [confirme, confirmer] = useState(false);
  const [termeNet, saisirTermeNet] = useState("");
  const [soldes, saisirSoldes] = useState([{ date: "", montant: "" }]);
  const ancienRegime = jour < ENTREE_EN_VIGUEUR_IMPAYES;
  const historique = soldes.filter((s) => s.date || s.montant).map((s) => ({
    jour: s.date,
    detteCentimes: centimes(s.montant),
  })).sort((a, b) => a.jour.localeCompare(b.jour));
  const valide = historique.length > 0 && historique.every((s, i) =>
    s.jour && s.jour <= jour && s.jour !== historique[i - 1]?.jour && Number.isSafeInteger(s.detteCentimes))
    && (!ancienRegime || (Number.isSafeInteger(centimes(termeNet)) && centimes(termeNet) > 0));
  const resultat = confirme && valide ? signalementAideLogement(jour, historique, centimes(termeNet)) : null;

  return (
    <details className="rounded-lg border p-4 text-sm" open={versementCafConnu || undefined}>
      <summary className="cursor-pointer font-medium">{versementCafConnu ? "Impayé avec versement CAF enregistré : signalement à vérifier" : "Vérifier un signalement d’impayé en tiers payant"}</summary>
      <div className="mt-3 space-y-3">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={confirme} onChange={(e) => confirmer(e.target.checked)} />
          La CAF ou la MSA me verse toujours l’aide et cet impayé reste à signaler.
        </label>
        {confirme && <>
          {ancienRegime && <label className="block">Loyer mensuel et charges après déduction de l’aide, en euros
            <input className="block rounded border p-2" inputMode="decimal" value={termeNet} onChange={(e) => saisirTermeNet(e.target.value)} />
          </label>}
          <p>Pour la part du locataire, indiquez le solde au premier défaut constaté, puis à chaque changement. Saisissez 0 € à chaque règlement intégral.</p>
          {soldes.map((solde, i) => (
            <div className="flex flex-wrap gap-2" key={i}>
              <label>Date du solde {i + 1}
                <input type="date" max={jour} className="block rounded border p-2" value={solde.date}
                  onChange={(e) => saisirSoldes(soldes.map((s, n) => n === i ? { ...s, date: e.target.value } : s))} />
              </label>
              <label>Dette restante en euros
                <input inputMode="decimal" className="block w-40 rounded border p-2" value={solde.montant}
                  onChange={(e) => saisirSoldes(soldes.map((s, n) => n === i ? { ...s, montant: e.target.value } : s))} />
              </label>
            </div>
          ))}
          <button type="button" className="min-h-11 underline" onClick={() => saisirSoldes([...soldes, { date: "", montant: "" }])}>
            Ajouter un changement de solde
          </button>
          <div aria-live="polite" className="space-y-2">
            {!ancienRegime && historique.some((s) => s.jour < ENTREE_EN_VIGUEUR_IMPAYES) && (
              <p>À vérifier auprès de la caisse : votre dossier a commencé avant le 1ᵉʳ janvier 2027. Vérifiez dès maintenant si un délai avait déjà commencé à courir.</p>
            )}
            {resultat ? <p className="font-medium">
              Signalez vous-même l’impayé à votre caisse. Date limite calculée : {formaterDate(resultat.limite)}.
              {resultat.limite < jour && " Ce délai est dépassé. Contactez votre caisse dès maintenant."}
              {" "}Préparez le détail des loyers dus et des versements.
            </p> : valide ? <p>Sur les soldes renseignés, aucun délai de signalement n’est calculé à ce jour.</p> : null}
          </div>
        </>}
      </div>
    </details>
  );
}
