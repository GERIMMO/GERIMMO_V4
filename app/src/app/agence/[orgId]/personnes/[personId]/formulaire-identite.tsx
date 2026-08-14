"use client";

import { useActionState, useEffect, useState } from "react";
import {
  archiverPersonne,
  modifierPersonne,
  type EtatPersonne,
} from "@/app/actions/personnes";
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
  const [etat, formAction, enCours] = useActionState<EtatPersonne, FormData>(action, {});
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
      <Button type="submit" variant="outline" size="sm" disabled={enCours}>
        {enCours ? "Archivage…" : "Confirmer l'archivage"}
      </Button>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Modifier l'identité d'une fiche (recette 13/08) : replié par défaut, le
// formulaire reprend les valeurs actuelles — l'email reste unique par agence.
export function FormulaireIdentite({
  orgId,
  personId,
  nom,
  prenom,
  email,
  telephone,
  dateNaissance,
}: {
  orgId: string;
  personId: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  dateNaissance: string | null;
}) {
  const action = modifierPersonne.bind(null, orgId, personId);
  const [etat, formAction, enCours] = useActionState<EtatPersonne, FormData>(action, {});
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ident-nom">Nom ou raison sociale *</Label>
          <Input id="ident-nom" name="nom" required maxLength={120} defaultValue={nom} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-prenom">Prénom{prenom ? " *" : ""}</Label>
          {/* Une personne physique garde un prénom ; une raison sociale n'en a pas */}
          <Input
            id="ident-prenom"
            name="prenom"
            maxLength={120}
            required={Boolean(prenom)}
            defaultValue={prenom ?? ""}
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
            defaultValue={email ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-tel">Téléphone</Label>
          <Input id="ident-tel" name="telephone" maxLength={40} defaultValue={telephone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ident-naissance">Date de naissance</Label>
          <Input
            id="ident-naissance"
            name="date_naissance"
            type="date"
            defaultValue={dateNaissance ?? ""}
          />
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
