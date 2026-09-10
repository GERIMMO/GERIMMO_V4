"use client";

import { useActionState, useEffect, useState } from "react";
import {
  archiverPersonne,
  modifierPersonne,
  type EtatPersonne,
} from "@/app/actions/personnes";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [etat, formAction] = useActionState<EtatPersonne, FormData>(action, {});
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
}) {
  const action = modifierPersonne.bind(null, orgId, personId);
  const [etat, formAction] = useActionState<EtatPersonne, FormData>(action, {});
  const [ouvert, setOuvert] = useState(false);

  // Fiche mise à jour : le formulaire se replie, la page se recharge d'elle-même.
  // Repli piloté par la réponse du serveur, pas un état dérivé du rendu.
  useEffect(() => {
    if (!etat.succes) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setOuvert(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [etat]);

  if (!ouvert) {
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
    <form action={formAction} className="mt-2 max-w-xl space-y-3 border border-border bg-card p-4">
      <p className="text-sm font-medium">Modifier la fiche</p>
      {/* En erreur, l'action renvoie la saisie (etat.valeurs) : le reset React
          retombe sur les corrections, pas sur les valeurs d'origine. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ident-nom">Nom ou raison sociale *</Label>
          <Input id="ident-nom" name="nom" required maxLength={120} defaultValue={etat.valeurs?.nom ?? nom} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-prenom">Prénom{prenom ? " *" : ""}</Label>
          {/* Une personne physique garde un prénom ; une raison sociale n'en a pas */}
          <Input
            id="ident-prenom"
            name="prenom"
            maxLength={120}
            required={Boolean(prenom)}
            defaultValue={etat.valeurs?.prenom ?? prenom ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-email">Adresse email *</Label>
          <Input
            id="ident-email"
            name="email"
            type="email"
            required
            maxLength={200}
            defaultValue={etat.valeurs?.email ?? email ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-tel">Téléphone</Label>
          <Input id="ident-tel" name="telephone" type="tel" autoComplete="tel" maxLength={40} defaultValue={etat.valeurs?.telephone ?? telephone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-naissance">Date de naissance</Label>
          <Input
            id="ident-naissance"
            name="date_naissance"
            type="date"
            defaultValue={etat.valeurs?.date_naissance ?? dateNaissance ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-commune-naissance">Commune de naissance</Label>
          <Input
            id="ident-commune-naissance"
            name="commune_naissance"
            maxLength={120}
            defaultValue={etat.valeurs?.commune_naissance ?? communeNaissance ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ident-adresse">Adresse</Label>
          <Input
            id="ident-adresse"
            name="address_line1"
            maxLength={200}
            defaultValue={etat.valeurs?.address_line1 ?? adresse ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-cp">Code postal</Label>
          <Input
            id="ident-cp"
            name="postal_code"
            maxLength={12}
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={etat.valeurs?.postal_code ?? codePostal ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-ville">Ville</Label>
          <Input
            id="ident-ville"
            name="city"
            maxLength={120}
            defaultValue={etat.valeurs?.city ?? ville ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ident-qualite">Qualité (bail)</Label>
          <Input
            id="ident-qualite"
            name="qualite"
            maxLength={120}
            placeholder="Personne physique, SCI, indivision…"
            defaultValue={etat.valeurs?.qualite ?? qualite ?? ""}
          />
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
        <BoutonEnvoi size="sm" enCoursTexte="Enregistrement…">
          Enregistrer
        </BoutonEnvoi>
      </div>
    </form>
  );
}
