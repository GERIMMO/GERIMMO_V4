"use client";

// Les deux déclarations du contrat (plan de conformité du 23/10/2026) : « Confirmer la rétractation » (R01, R37) et
// « Notifier la résiliation » (R04). Les champs sont préremplis et modifiables ; le serveur revérifie tout (droits,
// délai, adresse) et dit l'échec en français.

import { useId } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { retracterAbonnement, type EtatRetractationAction } from "@/app/actions/retractation";
import { resilierAbonnement, type EtatAbonnementAction } from "@/app/actions/abonnement";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

function Champ({ libelle, nom, valeur, type = "text", aide, autoComplete }: { libelle: string; nom: string; valeur: string; type?: string; aide?: string; autoComplete?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="libelle-champ">
        {libelle}
      </label>
      <input id={id} name={nom} type={type} defaultValue={valeur} required autoComplete={autoComplete} className="champ w-full" aria-describedby={aide ? `${id}-aide` : undefined} />
      {aide && (
        <p id={`${id}-aide`} className="text-xs text-muted-foreground">
          {aide}
        </p>
      )}
    </div>
  );
}

export function FormulaireRetractation({
  orgId,
  nature,
  nom,
  adresse,
  saisieSuperviseur,
}: {
  orgId: string;
  nature: "abonnement" | "passage_annuel";
  nom: string;
  adresse: string;
  /** Rétractation reçue par courriel, saisie par le super-administrateur : la date de réception est demandée. */
  saisieSuperviseur: boolean;
}) {
  const [etat, action] = useActionState<EtatRetractationAction, FormData>(retracterAbonnement.bind(null, orgId), {});
  return (
    <form data-saisie-confirmee action={action} className="space-y-4">
      <input type="hidden" name="nature" value={nature} />
      <Champ libelle="Nom et prénom" nom="nom" valeur={nom} autoComplete="name" />
      <Champ
        libelle="Adresse électronique de l'accusé de réception"
        nom="adresse"
        type="email"
        valeur={adresse}
        autoComplete="email"
        aide="Nous y envoyons sans délai l'accusé de réception de votre déclaration."
      />
      {saisieSuperviseur && (
        <Champ
          libelle="Date et heure de réception de la déclaration (courriel ou « Aide et retours »), heure de Paris"
          nom="recue_le"
          type="datetime-local"
          valeur=""
          aide="Saisie par la supervision Gerimmo d'une rétractation reçue hors du bouton « Renoncer au contrat ici » (article 8.10 des conditions générales : courriel ou page « Aide et retours »)."
        />
      )}
      <BoutonEnvoi enCoursTexte="Enregistrement de votre rétractation…">Confirmer la rétractation</BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

export function FormulaireResiliation({ orgId, nom, adresse }: { orgId: string; nom: string; adresse: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(resilierAbonnement.bind(null, orgId), {});
  return (
    <form data-saisie-confirmee action={action} className="space-y-4">
      <input type="hidden" name="resilier" value="oui" />
      <Champ libelle="Nom et prénom" nom="nom" valeur={nom} autoComplete="name" />
      <Champ
        libelle="Adresse électronique de l'accusé de réception"
        nom="adresse"
        type="email"
        valeur={adresse}
        autoComplete="email"
        aide="Nous y envoyons l'accusé de réception de votre résiliation, avec la date de fin du contrat."
      />
      <BoutonEnvoi enCoursTexte="Enregistrement de votre résiliation…">Notifier la résiliation</BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
