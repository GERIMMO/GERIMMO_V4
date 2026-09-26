"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  creerMandat,
  ajouterLigneMandat,
  changerEtatMandat,
  changerTitulaireMandat,
  supprimerLigneMandat,
  type EtatMandat,
} from "@/app/actions/mandats";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ComboboxLot } from "@/components/combobox-lot";

type LotOption = { id: string; libelle: string };

// Créer un mandat (brouillon)
export function FormulaireMandat({ orgId, personId }: { orgId: string; personId: string }) {
  const action = creerMandat.bind(null, orgId, personId);
  const [etat, formAction] = useActionState<EtatMandat, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">Nouveau mandat</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-rapport">Date de rapport (jour du mois)</Label>
          {/* defaultValue={etat.valeurs?.…} : en erreur, le reset React retombe
              sur la saisie (recette 22/08 — mécanique commune, lib/formulaires.ts) */}
          <Input
            id="m-rapport"
            name="date_rapport"
            type="number"
            min="1"
            max="28"
            defaultValue={etat.valeurs?.date_rapport ?? "10"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-seuil">Seuil de délégation (€)</Label>
          <Input id="m-seuil" name="seuil_delegation" type="number" min="0" placeholder="500 (défaut)" defaultValue={etat.valeurs?.seuil_delegation} />
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Création…">
        Créer le mandat
      </BoutonEnvoi>
    </form>
  );
}

// Ajouter un lot (ligne) au mandat, avec son taux
export function FormulaireLigneMandat({
  orgId,
  personId,
  mandatId,
  lots,
  nbLotsDetenus,
}: {
  orgId: string;
  personId: string;
  mandatId: string;
  lots: LotOption[];
  nbLotsDetenus: number;
}) {
  const action = ajouterLigneMandat.bind(null, orgId, personId, mandatId);
  const [etat, formAction] = useActionState<EtatMandat, FormData>(action, {});

  // Recette 22/08 : la liste ne propose plus les lots déjà couverts par un
  // mandat actif — proposer un lot pour le voir refusé alourdissait l'écran.
  if (lots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {nbLotsDetenus > 0
          ? "Tous les lots de cette personne sont déjà couverts par un mandat — rien à ajouter ici."
          : "Cette personne ne détient aucun lot — ajoutez d'abord une détention sur un lot du parc pour composer le mandat."}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor={`l-lot-${mandatId}`} className="text-sm">
          Lot
        </Label>
        {/* Même combobox que le rattachement de personne (recette 21/08) */}
        <ComboboxLot lots={lots} id={`l-lot-${mandatId}`} name="lot_id" requis />
      </div>
      {/* Pleine largeur au téléphone, comme le lot au-dessus (24/09) */}
      <div className="w-full space-y-1.5 sm:w-24">
        <Label htmlFor={`l-taux-${mandatId}`} className="text-sm">
          Taux %
        </Label>
        {/* Recette 22/08 : le taux est contractuel — il se choisit, pas de
            valeur glissée en silence. */}
        <Input
          id={`l-taux-${mandatId}`}
          name="taux_honoraires"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          placeholder="ex. 7"
          defaultValue={etat.valeurs?.taux_honoraires}
        />
      </div>
      {/* h-8 comme le champ Taux voisin (24/09) */}
      <BoutonEnvoi variant="outline">Ajouter</BoutonEnvoi>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Confier le mandat à un agent (maquette v3, RM-18.1.3) : c'est ce champ qui
// dessine le « portefeuille » de chacun — vide, le mandat est suivi par toute
// l'agence. Le changement part au choix, sans bouton.
export function SelectTitulaireMandat({
  orgId,
  personId,
  mandatId,
  titulaire,
  gerants,
}: {
  orgId: string;
  personId: string;
  mandatId: string;
  titulaire: string | null;
  gerants: { account_id: string; email: string }[];
}) {
  const action = changerTitulaireMandat.bind(null, orgId, personId, mandatId);
  const [etat, formAction, enCours] = useActionState<EtatMandat, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <label htmlFor={`m-titulaire-${mandatId}`} className="text-xs text-muted-foreground">
        Confié à
      </label>
      <select
        id={`m-titulaire-${mandatId}`}
        name="agent_account_id"
        defaultValue={titulaire ?? ""}
        disabled={enCours}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        // Même boîte que les champs de la fiche (h-8, rounded-lg, text-sm) :
        // trois hauteurs de contrôle se côtoyaient (24/09).
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
      >
        <option value="">Toute l&apos;agence</option>
        {gerants.map((g) => (
          <option key={g.account_id} value={g.account_id}>
            {g.email}
          </option>
        ))}
      </select>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
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
      <BoutonRetirer />
    </form>
  );
}

function BoutonRetirer() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
      aria-label="Retirer ce lot du mandat"
    >
      {pending && <Spinner className="size-3" />} Retirer
    </button>
  );
}

// Les transitions sans retour (le cycle ne remonte pas : actif → préavis →
// résilié) : ce qu'elles font, dit avant de confirmer.
const SANS_RETOUR: Record<string, string> = {
  preavis: "Le mandat passe en préavis, sans retour possible.",
  resilie: "Le mandat est résilié et historisé, sans retour possible.",
};

// Boutons de transition d'état du mandat. Un mandat VIDE hors brouillon est
// une impasse (revue 23/08) : le seul geste proposé est le retour en
// brouillon, pour le composer — ou l'abandonner proprement.
// 24/09 : « Mettre en préavis » et « Résilier » demandent une confirmation en
// deux temps, comme l'archivage de la fiche — un clic, sans cadre ni
// confirmation, faisait passer un mandat actif en préavis sans retour.
export function BoutonsEtatMandat({
  orgId,
  personId,
  mandatId,
  etat,
  nbLignesActives,
}: {
  orgId: string;
  personId: string;
  mandatId: string;
  etat: string;
  nbLignesActives: number;
}) {
  const suivant: Record<string, { libelle: string; vers: string }> = {
    brouillon: { libelle: "Passer à signer", vers: "a_signer" },
    a_signer: { libelle: "Activer", vers: "actif" },
    actif: { libelle: "Mettre en préavis", vers: "preavis" },
    preavis: { libelle: "Résilier", vers: "resilie" },
  };
  const videHorsBrouillon = nbLignesActives === 0 && etat !== "brouillon" && etat !== "resilie";
  const transition = videHorsBrouillon
    ? { libelle: "Repasser en brouillon (mandat vide)", vers: "brouillon" }
    : suivant[etat];
  const action = changerEtatMandat.bind(
    null,
    orgId,
    personId,
    mandatId,
    transition?.vers ?? etat
  );
  const [etatAction, formAction] = useActionState<EtatMandat, FormData>(action, {});
  // La confirmation vaut pour l'état où elle a été demandée : une fois le
  // mandat passé en préavis, « Résilier » ne doit pas arriver déjà armé.
  const [confirmePour, setConfirmePour] = useState<string | null>(null);
  const confirmation = confirmePour === etat;

  if (!transition) return null;
  const avertissement = SANS_RETOUR[transition.vers];
  if (avertissement && !confirmation) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirmePour(etat)}>
        {transition.libelle}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {avertissement && (
        <>
          <span className="text-xs text-muted-foreground">{avertissement}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmePour(null)}>
            Annuler
          </Button>
        </>
      )}
      <BoutonEnvoi size="sm" variant="outline">
        {avertissement ? "Confirmer" : transition.libelle}
      </BoutonEnvoi>
      {etatAction.erreur && (
        <p className="w-full text-sm text-destructive">{etatAction.erreur}</p>
      )}
    </form>
  );
}
