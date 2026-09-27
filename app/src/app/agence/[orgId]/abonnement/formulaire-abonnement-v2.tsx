"use client";

import { useActionState, useState } from "react";
import { preparerAbonnementV2, confirmerAbonnementV2, type EtatAbonnementV2Action } from "@/app/actions/abonnement-v2";
import { calculerTarif, formaterCentimes, libellePeriodicite, type Periodicite, type PublicTarif } from "@/lib/tarification";
import { dateAbonnement } from "@/lib/abonnement-v2";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function FormulaireAbonnementV2({ orgId, publicTarif, volumeActuel, capacite, periodiciteActuelle, souscrit, essaiFin, volumeSuggere, changementProgramme }:
  { orgId: string; publicTarif: PublicTarif; volumeActuel: number; capacite: number | null; periodiciteActuelle: Periodicite | null; souscrit: boolean; essaiFin: string | null; volumeSuggere?: number; changementProgramme?: boolean }) {
  const [periodicite, setPeriodicite] = useState<Periodicite>(periodiciteActuelle ?? "mensuel");
  const [volume, setVolume] = useState(Math.max(volumeActuel, volumeSuggere ?? volumeActuel));
  const [etat, preparer] = useActionState<EtatAbonnementV2Action, FormData>(preparerAbonnementV2.bind(null, orgId), {});
  const [confirmation, confirmer] = useActionState<EtatAbonnementV2Action, FormData>(confirmerAbonnementV2.bind(null, orgId), {});
  const tarif = calculerTarif(publicTarif, Number.isSafeInteger(volume) && volume >= 0 ? volume : volumeActuel, periodicite);
  const proposition = etat.proposition;
  const [choixModifie, setChoixModifie] = useState(false);
  return <section className="loc-carte space-y-5" aria-labelledby="titre-choix-abonnement">
    <div><h2 id="titre-choix-abonnement">{souscrit ? "Adapter mon abonnement" : "Choisir mon abonnement"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">La formule la moins chère couvrant votre portefeuille est proposée. Le récapitulatif suivant indique le total et la date de prélèvement avant votre accord.</p></div>
    <form action={async (form) => { setChoixModifie(false); await preparer(form); }} className="space-y-4">
      <input type="hidden" name="type" value={souscrit ? "changement" : "souscription"} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="volume-abonnement" className="libelle-champ">{publicTarif === "agence" ? "Lots à couvrir sous mandat actif" : "Biens à couvrir"}</label>
          <input id="volume-abonnement" name="volume" type="number" min={volumeActuel} max={1000000} step={1} required value={volume}
            onChange={e => { setChoixModifie(true); setVolume(Number(e.target.value)); }} className="mt-1 w-full rounded-lg border bg-background p-2.5" />
          <p className="mt-1 text-xs text-muted-foreground">{volumeActuel} actuellement compté{volumeActuel > 1 ? "s" : ""}{capacite != null ? ` · capacité confirmée : ${capacite}` : ""}.</p></div>
        <div><label htmlFor="periodicite-abonnement" className="libelle-champ">Rythme de paiement</label>
          <select id="periodicite-abonnement" name="periodicite" value={periodicite} onChange={e => { setChoixModifie(true); setPeriodicite(e.target.value as Periodicite); }} className="mt-1 w-full rounded-lg border bg-background p-2.5">
            <option value="mensuel">Chaque mois</option>{publicTarif !== "agence" && <option value="annuel">Chaque année — 2 mois offerts</option>}
          </select></div>
      </div>
      <div className="rounded-xl bg-[var(--marque-douce)] p-4">
        <p className="font-semibold">{tarif.libelle} · {formaterCentimes(tarif.montantCentimes)} {tarif.taxeIncluse ? "TTC" : "HT"} {libellePeriodicite(periodicite)}</p>
        {periodicite === "annuel" && <p className="mt-1 text-sm">Douze mois de gestion : {formaterCentimes(tarif.montantCentimes)} prélevés en une seule fois. Économie : {formaterCentimes(tarif.economieAnnuelleCentimes)} par rapport à douze mensualités.</p>}
        {publicTarif === "agence" && <p className="mt-1 text-sm">Les taxes applicables et le total seront vérifiés avant confirmation. Le socle reste dû après souscription, même sans mandat actif.</p>}
        {essaiFin && !souscrit && <p className="mt-1 text-sm">Votre essai reste gratuit jusqu’au {dateAbonnement(essaiFin)}. Souscrire aujourd’hui ne retire aucun jour d’essai.</p>}
      </div>
      <BoutonEnvoi enCoursTexte="Calcul du récapitulatif…">Voir le montant et la date avant de confirmer</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
    {changementProgramme && <form action={async (form) => { setChoixModifie(false); await preparer(form); }} className="space-y-2">
      <input type="hidden" name="type" value="annulation_changement" /><input type="hidden" name="periodicite" value={periodiciteActuelle ?? "mensuel"} /><input type="hidden" name="volume" value={volumeActuel} />
      <p className="text-sm text-muted-foreground">Un changement est programmé. Pour le retirer et conserver votre formule actuelle, vérifiez son montant de renouvellement avant de confirmer.</p>
      <BoutonEnvoi variant="outline" enCoursTexte="Vérification du renouvellement…">Préparer l’annulation du changement prévu</BoutonEnvoi>
    </form>}
    {souscrit && <form action={async (form) => { setChoixModifie(false); await preparer(form); }}>
      <input type="hidden" name="type" value="resiliation" /><input type="hidden" name="periodicite" value={periodiciteActuelle ?? "mensuel"} /><input type="hidden" name="volume" value={volumeActuel} />
      <BoutonEnvoi variant="outline" enCoursTexte="Vérification de l’échéance…">Préparer ma résiliation à l’échéance</BoutonEnvoi>
    </form>}
    {proposition && !choixModifie && <form action={confirmer} className="space-y-4 rounded-xl border border-[var(--marque)] p-4" aria-labelledby="titre-recap-abonnement">
      <h3 id="titre-recap-abonnement">Votre récapitulatif avant accord</h3>
      <input type="hidden" name="proposition_id" value={proposition.id} />
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt>Opération</dt><dd>{proposition.type === "annulation_changement" ? "Annulation du changement prévu" : proposition.type === "resiliation" ? "Résiliation à l’échéance" : proposition.type === "baisse" ? "Baisse programmée" : proposition.type === "augmentation" ? "Augmentation de capacité" : "Souscription"}</dd></div>
        <div className="flex justify-between gap-3"><dt>Capacité</dt><dd>{proposition.capacite} {publicTarif === "agence" ? "lots" : "biens"}</dd></div>
        <div className="flex justify-between gap-3"><dt>Date d’effet</dt><dd>{dateAbonnement(proposition.dateEffet)}</dd></div>
        {publicTarif === "agence" && <div className="flex justify-between gap-3"><dt>Montant hors taxes</dt><dd>{formaterCentimes(proposition.montantCents)}</dd></div>}
        <div className="flex justify-between gap-3"><dt>Taxes</dt><dd>{formaterCentimes(proposition.taxesCents)}</dd></div>
        <div className="flex justify-between gap-3 font-semibold"><dt>Total {proposition.periodicite === "annuel" ? "annuel en une fois" : "mensuel"}</dt><dd>{formaterCentimes(proposition.totalCents)}</dd></div>
        {proposition.type === "souscription" && proposition.premierPrelevementCents != null && <div className="flex justify-between gap-3 font-semibold"><dt>Premier prélèvement après les avoirs acquis</dt><dd>{formaterCentimes(proposition.premierPrelevementCents)}</dd></div>}
        <div className="flex justify-between gap-3"><dt>Ajustement de la période en cours</dt><dd>{formaterCentimes(proposition.prorataCents)}</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">{proposition.detailFiscal}</p>
      <p className="text-sm text-muted-foreground">{proposition.type === "resiliation" ? "Vos droits payés restent accessibles jusqu’à la fin de la période. Ensuite, vos données restent consultables et exportables." : proposition.periodicite === "annuel" ? "Paiement en une fois pour douze mois, renouvelé chaque année sauf résiliation avant la prochaine échéance. Une baisse s’applique au renouvellement ; l’accès déjà payé est conservé." : "Paiement renouvelé chaque mois, sans engagement annuel. La résiliation prend effet à la prochaine échéance. Une baisse de capacité s’applique à cette date."}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmation" value="oui" required className="mt-1" />
        <span>J’accepte cette opération, le montant indiqué, sa date d’effet et les conditions de renouvellement. Aucun changement supplémentaire n’est autorisé par cet accord.</span></label>
      <BoutonEnvoi enCoursTexte="Enregistrement de votre accord…">{proposition.type === "annulation_changement" ? "Conserver ma formule actuelle" : proposition.type === "resiliation" ? "Confirmer la résiliation à l’échéance" : "Confirmer ce récapitulatif"}</BoutonEnvoi>
      {confirmation.erreur && <p role="alert" className="text-sm text-destructive">{confirmation.erreur}</p>}
      {confirmation.succes && <p role="status" className="text-sm">{confirmation.succes}</p>}
    </form>}
  </section>;
}
