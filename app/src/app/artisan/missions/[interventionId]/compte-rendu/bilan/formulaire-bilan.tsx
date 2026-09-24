"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  demanderMonAvenant,
  deposerMonCompteRendu,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import type { LigneDevis } from "@/lib/devis-structure";
import { LignesDevis } from "../../../../lignes-devis";
import { IMPUTATIONS } from "../../../../libelles";
import {
  Carte,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
  TitreSection,
} from "../../../../ui";

/**
 * COMPTE RENDU — ÉCRAN 2 SUR 2 : le bilan.
 *
 * Quatre champs, dont un seul obligatoire. C'est délibéré : le compte rendu
 * conditionne la facturation, et un formulaire pénible est un compte rendu
 * qu'on remet à demain — « la condition pour qu'il joue le jeu » (module 19).
 *
 * RM-7.5.3 — L'ARTISAN SIGNALE, L'AGENT RÉVISE. Il est le seul à voir la cause
 * réelle en ouvrant le mur ; mais il ne requalifie pas l'incident, et l'écran
 * ne lui laisse pas croire le contraire : on lui demande CE QU'IL A CONSTATÉ,
 * et le choix de cause s'annonce comme une suggestion. Une suggestion qui
 * diffère de l'imputation posée ouvre, côté agence, une alerte de révision
 * avant facturation. C'est l'agent qui tranche, avec justification.
 */

function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi du compte rendu…" : "Terminer l'intervention"}
    </button>
  );
}

function EnvoyerAvenant() {
  const { pending } = useFormStatus();
  return <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>{pending ? "Envoi de la demande…" : "Demander l’accord"}</button>;
}

export function FormulaireBilan({
  interventionId,
  montantDevisCents,
  lignesInitiales = [],
  avenants = [],
}: {
  interventionId: string;
  montantDevisCents: number | null;
  lignesInitiales?: LigneDevis[];
  avenants?: {id: string; statut: string; motif: string; nouveau_montant_cents: number; decision_motif: string | null}[];
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMonCompteRendu.bind(null, interventionId),
    {}
  );
  const [etatAvenant, actionAvenant] = useActionState<EtatArtisanAction, FormData>(
    demanderMonAvenant.bind(null, interventionId),
    {}
  );
  const [autreCause, setAutreCause] = useState(false);
  const idTravaux = useId();
  const idMontant = useId();
  const idCause = useId();
  const idImputation = useId();
  const idNouvelle = useId();

  const euros = (cents: number) => new Intl.NumberFormat("fr-FR", {style:"currency",currency:"EUR"}).format(cents/100);
  const enAttente = avenants.some(a => a.statut === "a_decider");
  return (
    <div className="space-y-5">
      {montantDevisCents !== null && <Carte><TitreSection>Budget autorisé : {euros(montantDevisCents)}</TitreSection>
        {avenants.map(a => <div key={a.id} className="mt-3 border-t border-[var(--filet)] pt-3 text-sm">
          <p className="font-semibold">{a.statut === "a_decider" ? "Accord attendu" : a.statut === "accepte" ? "Dépassement accepté" : a.statut === "refuse" ? "Dépassement refusé" : "Demande annulée"} · {euros(a.nouveau_montant_cents)}</p>
          <p>{a.motif}</p>{a.decision_motif && <p className="text-[var(--texte-secondaire)]">Réponse : {a.decision_motif}</p>}
        </div>)}
        {enAttente && <p className="mt-3 text-sm">Attendez la réponse avant d’engager les travaux supplémentaires. Le budget autorisé reste le plafond de cette intervention.</p>}
      </Carte>}
      {montantDevisCents !== null && !enAttente && (
        // Repliée par défaut : la plupart des interventions restent dans le
        // devis. Rouverte d'office après un envoi pour montrer le résultat.
        <details
          className="artisan-carte information-depliable border-l-4 border-l-[var(--warning)]"
          open={Boolean(etatAvenant.erreur || etatAvenant.succes)}
        >
          <summary>
            Le coût dépasse le devis accepté ?
            <span aria-hidden className="information-chevron">⌄</span>
          </summary>
          <p className="mt-4 text-[0.9375rem] text-[var(--texte-secondaire)]">
            Demandez l&apos;accord avant de terminer. Le nouveau total, la raison et la décision restent dans le dossier.
          </p>
          <form action={actionAvenant} className="mt-4 space-y-3">
            <p className="text-sm">Reprenez le détail complet des travaux, y compris les postes déjà prévus. Le total remplacera le montant autorisé après acceptation.</p>
            <LignesDevis titre="Nouveau détail complet" initiales={lignesInitiales} />
            <div className="space-y-1.5">
              <label className={CLASSE_LIBELLE} htmlFor="motif-avenant">Pourquoi le montant change</label>
              <textarea id="motif-avenant" name="motif_avenant" rows={3} required minLength={10} className={CLASSE_ZONE_TEXTE} defaultValue={etatAvenant.valeurs?.motif_avenant} />
            </div>
            {etatAvenant.erreur && <Erreur>{etatAvenant.erreur}</Erreur>}
            {etatAvenant.succes && <p className="text-sm text-[var(--success-soft-foreground)]">{etatAvenant.succes}</p>}
            <EnvoyerAvenant />
          </form>
        </details>
      )}
      <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={idTravaux} className={CLASSE_LIBELLE}>
          Ce que vous avez fait
        </label>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Une ou deux phrases suffisent. C&apos;est ce que lira l&apos;agence avant de
          facturer.
        </p>
        <textarea
          id={idTravaux}
          name="travaux"
          rows={4}
          required
          defaultValue={etat.valeurs?.travaux}
          className={CLASSE_ZONE_TEXTE}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idMontant} className={CLASSE_LIBELLE}>
          Montant final TTC{" "}
          <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
        </label>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          {montantDevisCents !== null
            ? "À renseigner seulement s'il diffère du devis retenu. S'il est supérieur, l'avenant doit être accepté avant l'envoi."
            : "Si vous connaissez déjà le montant de votre facture."}
        </p>
        <input
          id={idMontant}
          name="montant_final"
          type="text"
          inputMode="decimal"
          defaultValue={etat.valeurs?.montant_final}
          className={CLASSE_CHAMP}
        />
      </div>

      <Carte className="border-l-4 border-l-[var(--or)]">
        <TitreSection>Avez-vous trouvé autre chose que prévu ?</TitreSection>
        <p className="text-[0.9375rem] text-[var(--corps)]">
          Vous êtes le seul à avoir vu la cause réelle. Si elle ne correspond pas
          à ce qu&apos;on vous avait décrit, dites-le : l&apos;agence révisera qui paie
          avant de facturer. Vous signalez — c&apos;est elle qui tranche.
        </p>

        <label className="mt-3 flex min-h-12 items-center gap-3 text-base text-[var(--corps)]">
          <input
            type="checkbox"
            checked={autreCause}
            onChange={(e) => setAutreCause(e.target.checked)}
            className="size-6 shrink-0 accent-[var(--encre)]"
          />
          Oui, j&apos;ai constaté autre chose
        </label>

        {autreCause && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={idCause} className={CLASSE_LIBELLE}>
                Ce que vous avez constaté
              </label>
              <textarea
                id={idCause}
                name="cause_reelle"
                rows={3}
                defaultValue={etat.valeurs?.cause_reelle}
                className={CLASSE_ZONE_TEXTE}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={idImputation} className={CLASSE_LIBELLE}>
                Selon vous, qui devrait payer ?
              </label>
              <select
                id={idImputation}
                name="imputation_suggeree"
                defaultValue={etat.valeurs?.imputation_suggeree ?? ""}
                className={CLASSE_CHAMP}
              >
                <option value="">Je ne me prononce pas</option>
                {Object.entries(IMPUTATIONS).map(([cle, texte]) => (
                  <option key={cle} value={cle}>
                    {texte}
                  </option>
                ))}
              </select>
              <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
                Une suggestion, jamais une décision.
              </p>
            </div>
          </div>
        )}
      </Carte>

      <label
        htmlFor={idNouvelle}
        className="flex min-h-12 items-center gap-3 text-base text-[var(--corps)]"
      >
        <input
          id={idNouvelle}
          type="checkbox"
          name="nouvelle_intervention"
          value="oui"
          defaultChecked={etat.valeurs?.nouvelle_intervention === "oui"}
          className="size-6 shrink-0 accent-[var(--encre)]"
        />
        Une autre intervention sera nécessaire
      </label>

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer />
      </form>
    </div>
  );
}
