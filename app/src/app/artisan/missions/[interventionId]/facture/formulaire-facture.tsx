"use client";

import { useId, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { useFormStatus } from "react-dom";
import { deposerMaFacture, type EtatArtisanAction } from "@/app/actions/artisan";
import { LignesDevis } from "../../../lignes-devis";
import { ChampFichier } from "@/components/champ-fichier";
import { compresserChampFichiers } from "@/lib/compresser-image";
import { montantEnCentimes } from "@/lib/devis-structure";
import {
  CLASSE_AIDE,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
} from "../../../ui";

/**
 * Le dépôt de la facture (module 9.7, version simple — wiki : concepts/Devis).
 *
 * Le montant est PRÉ-REMPLI avec le plafond engagé (devis retenu, ou avenant
 * accepté). S'il change, le champ d'explication apparaît et devient
 * obligatoire : « écart alerté sans blocage, justifié par l'artisan, tranché
 * par l'agent ». La base revérifie tout (migration 20260927123000).
 */
function Envoyer({ creation }: { creation: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi…" : creation ? "Créer et transmettre ma facture" : "Déposer ma facture"}
    </button>
  );
}

function enSaisie(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function FormulaireFacture({
  interventionId,
  plafondCents, adresseEntreprise, mentionsEntreprise, lieuTravaux,
}: {
  interventionId: string;
  plafondCents: number | null;
  adresseEntreprise?: string;
  mentionsEntreprise?: string;
  lieuTravaux?: string;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMaFacture.bind(null, interventionId),
    {}
  );
  const [montant, setMontant] = useState(etat.valeurs?.montant ?? enSaisie(plafondCents));
  const saisi = montantEnCentimes(montant);
  const ecart = plafondCents !== null && saisi !== null && saisi !== plafondCents;

  const [creation, setCreation] = useState(false);
  const suggestions: Record<string, string | undefined> = { adresse_entreprise: adresseEntreprise, lieu_travaux: lieuTravaux };
  const idNumero = useId();
  const idMontant = useId();
  const idJustification = useId();
  const idFichier = useId();

  return (
    <form data-saisie-confirmee action={action} className="space-y-5">
      <fieldset>
        <legend className={CLASSE_LIBELLE}>Comment souhaitez-vous facturer ?</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name="mode_facture" value="depot" checked={!creation} onChange={() => setCreation(false)} />Déposer une facture existante</label>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name="mode_facture" value="particulier" checked={creation} onChange={() => setCreation(true)} />Créer une facture de travaux pour un particulier</label>
      </fieldset>
      <div className="space-y-1.5">
        <label htmlFor={idNumero} className={CLASSE_LIBELLE}>
          Numéro de la facture
        </label>
        <input
          id={idNumero}
          name="numero"
          type="text"
          required
          maxLength={60}
          defaultValue={etat.valeurs?.numero}
          className={CLASSE_CHAMP}
        />
      </div>

      {!creation && <div className="space-y-1.5">
        <label htmlFor={idMontant} className={CLASSE_LIBELLE}>
          Montant TTC (€)
        </label>
        <input
          id={idMontant}
          name="montant"
          type="text"
          inputMode="decimal"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className={CLASSE_CHAMP}
        />
        <p className={CLASSE_AIDE}>
          Pré-rempli avec le montant engagé. Un autre montant reste possible :
          expliquez alors l&apos;écart, votre interlocuteur le tranchera.
        </p>
      </div>}

      {!creation && ecart && (
        <div className="space-y-1.5">
          <label htmlFor={idJustification} className={CLASSE_LIBELLE}>
            Pourquoi le montant diffère-t-il du devis ?
          </label>
          <textarea
            id={idJustification}
            name="justification"
            rows={3}
            required
            maxLength={4000}
            defaultValue={etat.valeurs?.justification}
            className={CLASSE_ZONE_TEXTE}
          />
        </div>
      )}

      {creation ? <fieldset className="space-y-4">
        <legend className={CLASSE_LIBELLE}>Facture au propriétaire particulier</legend>
        <p className={CLASSE_AIDE}>Utilisez le prochain numéro de votre série. Pour une SCI ou un autre client professionnel, déposez votre facture existante.</p>
        {([
          ["adresse_entreprise", "Adresse de votre entreprise", "text", 500],
          ["client_facture", "Nom du propriétaire à facturer", "text", 250],
          ["adresse_client", "Adresse de facturation du propriétaire", "text", 500],
          ["lieu_travaux", "Adresse des travaux", "text", 500],
          ["date_travaux", "Date de réalisation des travaux", "date", 10],
          ["date_echeance", "Date limite de règlement", "date", 10],
          ["conditions_facture", "Conditions de règlement", "text", 1000],
        ] as const).map(([nom, libelle, type, max]) => <label key={nom} className="block space-y-1"><span className={CLASSE_LIBELLE}>{libelle}</span><input name={nom} type={type} required maxLength={max} defaultValue={etat.valeurs?.[nom] ?? suggestions[nom]} className={CLASSE_CHAMP}/></label>)}
        <label className="block space-y-1"><span className={CLASSE_LIBELLE}>Mentions de votre entreprise et de TVA</span><textarea required maxLength={3000} className={CLASSE_ZONE_TEXTE} name="mentions_facture" defaultValue={etat.valeurs?.mentions_facture ?? mentionsEntreprise}/><span className={CLASSE_AIDE}>Indiquez vos mentions professionnelles, votre numéro de TVA ou le motif d’exonération applicable et, si nécessaire, votre assurance.</span></label>
        <LignesDevis titre="Prestations facturées"/>
        {plafondCents !== null && <label className="block space-y-1"><span className={CLASSE_LIBELLE}>Justification si le total diffère du devis accepté</span><textarea name="justification" maxLength={4000} className={CLASSE_ZONE_TEXTE} defaultValue={etat.valeurs?.justification}/></label>}
        <label className="flex items-start gap-2"><input type="checkbox" required name="confirmation_facture" value="oui"/>Je confirme le destinataire, le numéro de ma série, les mentions et le total à facturer.</label>
      </fieldset> : <div className="space-y-1.5">
        <label htmlFor={idFichier} className={CLASSE_LIBELLE}>
          Votre facture
        </label>
        <ChampFichier
            depotDirect
          id={idFichier}
          name="fichier"
          accept="application/pdf,image/jpeg,image/png"
          required
          onChange={(e) => {
            void compresserChampFichiers(e.currentTarget);
          }}
          className={`${CLASSE_CHAMP} min-h-13 py-2`}
        />
        <p className={CLASSE_AIDE}>PDF ou photo. Elle rejoint le dossier de l’intervention.</p>
      </div>}

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer creation={creation} />
    </form>
  );
}
