"use client";

import { useActionState } from "react";
import {
  creerMandat,
  ajouterLigneMandat,
  changerEtatMandat,
  supprimerLigneMandat,
  type EtatMandat,
} from "@/app/actions/mandats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxLot } from "@/components/combobox-lot";

type LotOption = { id: string; libelle: string };

// Créer un mandat (brouillon)
export function FormulaireMandat({ orgId, personId }: { orgId: string; personId: string }) {
  const action = creerMandat.bind(null, orgId, personId);
  const [etat, formAction, enCours] = useActionState<EtatMandat, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">Nouveau mandat</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-rapport">Date de rapport (jour du mois)</Label>
          <Input
            id="m-rapport"
            name="date_rapport"
            type="number"
            min="1"
            max="28"
            defaultValue="10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-seuil">Seuil de délégation (€)</Label>
          <Input id="m-seuil" name="seuil_delegation" type="number" min="0" placeholder="500 (défaut)" />
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Création…" : "Créer le mandat"}
      </Button>
    </form>
  );
}

// Ajouter un lot (ligne) au mandat, avec son taux
export function FormulaireLigneMandat({
  orgId,
  personId,
  mandatId,
  lots,
}: {
  orgId: string;
  personId: string;
  mandatId: string;
  lots: LotOption[];
}) {
  const action = ajouterLigneMandat.bind(null, orgId, personId, mandatId);
  const [etat, formAction, enCours] = useActionState<EtatMandat, FormData>(action, {});

  if (lots.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Cette personne ne détient aucun lot — ajoutez d&apos;abord une détention
        sur un lot du parc pour composer le mandat.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor={`l-lot-${mandatId}`} className="text-xs">
          Lot
        </Label>
        {/* Même combobox que le rattachement de personne (recette 21/08) */}
        <ComboboxLot lots={lots} id={`l-lot-${mandatId}`} name="lot_id" requis />
      </div>
      <div className="w-24 space-y-1.5">
        <Label htmlFor={`l-taux-${mandatId}`} className="text-xs">
          Taux %
        </Label>
        <Input
          id={`l-taux-${mandatId}`}
          name="taux_honoraires"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue="7"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Ajouter"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Retirer un lot d'un mandat en brouillon (recette 21/08 : après signature,
// les lots et taux sont figés — le contrat fait foi)
export function BoutonRetirerLigne({
  orgId,
  personId,
  mandatId,
  ligneId,
}: {
  orgId: string;
  personId: string;
  mandatId: string;
  ligneId: string;
}) {
  const action = async () => {
    await supprimerLigneMandat(orgId, personId, mandatId, ligneId);
  };
  return (
    <form action={action} className="inline">
      <button
        type="submit"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
        aria-label="Retirer ce lot du mandat"
      >
        Retirer
      </button>
    </form>
  );
}

// Boutons de transition d'état du mandat
export function BoutonsEtatMandat({
  orgId,
  personId,
  mandatId,
  etat,
}: {
  orgId: string;
  personId: string;
  mandatId: string;
  etat: string;
}) {
  const suivant: Record<string, { libelle: string; vers: string }> = {
    brouillon: { libelle: "Passer à signer", vers: "a_signer" },
    a_signer: { libelle: "Activer", vers: "actif" },
    actif: { libelle: "Mettre en préavis", vers: "preavis" },
    preavis: { libelle: "Résilier", vers: "resilie" },
  };
  const transition = suivant[etat];
  const action = changerEtatMandat.bind(
    null,
    orgId,
    personId,
    mandatId,
    transition?.vers ?? etat
  );
  const [etatAction, formAction, enCours] = useActionState<EtatMandat, FormData>(action, {});

  if (!transition) return null;
  return (
    <form action={formAction}>
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        {enCours ? "…" : transition.libelle}
      </Button>
      {etatAction.erreur && (
        <p className="text-xs text-destructive">{etatAction.erreur}</p>
      )}
    </form>
  );
}
