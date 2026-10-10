"use client";
import { useActionStateSuivi } from "@/lib/suivi-enregistrement";

import { useEffect, useState } from "react";
import {
  archiverPersonne,
  modifierPersonne,
  type EtatPersonne,
} from "@/app/actions/personnes";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AIDE_QUALITE, QUALITES_BAILLEUR, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";

// Archiver la fiche (jamais de suppression) : confirmation en deux temps.
// Refusé côté serveur si la fiche porte encore des liens vivants.
export function BoutonArchiverPersonne({
  orgId,
  personId,
}: {
  orgId: string;
  personId: string;
}) {
  const action = archiverPersonne.bind(null, orgId, personId);
  const [etat, formAction] = useActionStateSuivi<EtatPersonne, FormData>(action, {});
  const [confirmation, setConfirmation] = useState(false);

  if (!confirmation) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmation(true)}>
        Archiver la fiche
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        La fiche disparaît des listes, rien n&apos;est supprimé.
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmation(false)}>
        Annuler
      </Button>
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Archivage…">
        Confirmer l&apos;archivage
      </BoutonEnvoi>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Modifier l'identité d'une fiche (recette 13/08) : replié par défaut, le
// formulaire reprend les valeurs actuelles — l'email reste unique par agence.
// État civil et adresse alimentent les contrats (bail nu) : commune de
// naissance, adresse postale et qualité du signataire.
export function FormulaireIdentite({
  orgId,
  personId,
  nom,
  prenom,
  email,
  telephone,
  dateNaissance,
  communeNaissance,
  adresse,
  codePostal,
  ville,
  qualite,
  // Arrivée par « Ajouter un email » (?modifier=1) : le formulaire est déjà
  // ouvert — la consigne sans geste renvoyait chercher le bouton en haut de
  // page, hors écran au téléphone (24/09).
  ouvertInitial = false,
  integre = false,
}: {
  orgId: string;
  personId: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  dateNaissance: string | null;
  communeNaissance: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  qualite: string | null;
  ouvertInitial?: boolean;
  integre?: boolean;
}) {
  const action = modifierPersonne.bind(null, orgId, personId);
  const [etat, formAction] = useActionStateSuivi<EtatPersonne, FormData>(action, {});
  const [ouvert, setOuvert] = useState(ouvertInitial);

  // Fiche mise à jour : le formulaire se replie, la page se recharge d'elle-même.
  // Repli piloté par la réponse du serveur, pas un état dérivé du rendu.
  useEffect(() => {
    if (!etat.succes || integre) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setOuvert(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [etat, integre]);

  if (!ouvert && !integre) {
    return (
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
          Modifier la fiche
        </Button>
        {etat.succes && (
          <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
        )}
      </div>
    );
  }

  return (
    // w-full : dans la rangée d'actions, le formulaire ouvert se serrait contre
    // « Archiver la fiche » — 200 px de large au téléphone (24/09).
    <form onReset={event => { if (integre) event.preventDefault(); }} action={formAction} className={integre ? "w-full space-y-3" : "mt-2 w-full max-w-xl space-y-3 rounded-lg border border-border bg-card p-4"}>
      {!integre && <p className="text-sm font-medium">Modifier la fiche</p>}
      {/* En erreur, l'action renvoie la saisie (etat.valeurs) : le reset React
          retombe sur les corrections, pas sur les valeurs d'origine. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`ident-nom-${personId}`}>Nom ou raison sociale *</Label>
          <Input id={`ident-nom-${personId}`} name="nom" required maxLength={120} defaultValue={etat.valeurs?.nom ?? nom} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-prenom-${personId}`}>Prénom{prenom ? " *" : ""}</Label>
          {/* Une personne physique garde un prénom ; une raison sociale n'en a pas */}
          <Input
            id={`ident-prenom-${personId}`}
            name="prenom"
            maxLength={120}
            required={Boolean(prenom)}
            defaultValue={etat.valeurs?.prenom ?? prenom ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-email-${personId}`}>Adresse email *</Label>
          <Input
            id={`ident-email-${personId}`}
            name="email"
            type="email"
            required
            maxLength={200}
            defaultValue={etat.valeurs?.email ?? email ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-tel-${personId}`}>Téléphone — Facultatif</Label>
          <Input id={`ident-tel-${personId}`} name="telephone" type="tel" autoComplete="tel" maxLength={40} defaultValue={etat.valeurs?.telephone ?? telephone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-naissance-${personId}`}>Date de naissance{prenom ? " *" : ""}</Label>
          <Input
            id={`ident-naissance-${personId}`}
            name="date_naissance"
            type="date"
            required={Boolean(prenom)}
            defaultValue={etat.valeurs?.date_naissance ?? dateNaissance ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-commune-naissance-${personId}`}>Commune de naissance{prenom ? " *" : ""}</Label>
          <Input
            id={`ident-commune-naissance-${personId}`}
            name="commune_naissance"
            maxLength={120}
            required={Boolean(prenom)}
            defaultValue={etat.valeurs?.commune_naissance ?? communeNaissance ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`ident-adresse-${personId}`}>Adresse *</Label>
          <Input
            id={`ident-adresse-${personId}`}
            name="address_line1"
            maxLength={200}
            required
            defaultValue={etat.valeurs?.address_line1 ?? adresse ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-cp-${personId}`}>Code postal *</Label>
          <Input
            id={`ident-cp-${personId}`}
            name="postal_code"
            maxLength={12}
            required
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={etat.valeurs?.postal_code ?? codePostal ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ident-ville-${personId}`}>Ville *</Label>
          <Input
            id={`ident-ville-${personId}`}
            name="city"
            maxLength={120}
            required
            defaultValue={etat.valeurs?.city ?? ville ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`ident-qualite-${personId}`}>Qualité (bail)</Label>
          {/* Liste fermée (audit 29/09) : la durée du bail nu en dépend —
              3 ans pour une personne physique, une indivision de personnes
              physiques ou une SCI familiale, 6 ans pour une autre personne
              morale (art. 10 et 13 de la loi du 6 juillet 1989). */}
          <select
            id={`ident-qualite-${personId}`}
            name="qualite"
            defaultValue={etat.valeurs?.qualite ?? normaliserQualiteBailleur(qualite) ?? ""}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Non précisée</option>
            {QUALITES_BAILLEUR.map((q) => (
              <option key={q} value={q}>
                {q} — {AIDE_QUALITE[q]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {integre && etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex items-center gap-2">
        {!integre && <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>}
        <BoutonEnvoi size="sm" enCoursTexte="Enregistrement…">
          Enregistrer
        </BoutonEnvoi>
      </div>
    </form>
  );
}
