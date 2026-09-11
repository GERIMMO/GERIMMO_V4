"use client";
import { InputDateJour } from "@/components/input-date-jour";

import { useActionState } from "react";
import {
  ajouterEcriture,
  passerContreEcriture,
  cloturerMois,
  ventilerDepense,
  genererRapport,
  envoyerRapport,
  enregistrerVersement,
  type EtatCompta,
} from "@/app/actions/compta";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eur, moisEnFrancais } from "@/lib/ged";

// Le dernier mois RÉVOLU, à partir d'un « AAAA-MM ». C'est le mois que la base
// accepte de clôturer (RM-4.4.1) et donc le seul dont un rapport de gestion
// puisse être généré, puisque la génération est bloquée tant que la période
// n'est pas close (RM-6.1.2). Les deux formulaires de l'écran doivent viser le
// même mois : proposer le mois en cours au rapport menait tout droit au refus
// « Mois non clôturé » dès lors que le mois en cours ne se clôture plus.
function dernierMoisRevolu(moisCourant: string): string {
  const [an, mois] = moisCourant.split("-").map(Number);
  const anPrecedent = mois === 1 ? an - 1 : an;
  const moisPrecedent = mois === 1 ? 12 : mois - 1;
  return `${anPrecedent}-${String(moisPrecedent).padStart(2, "0")}`;
}

export type MandatCompta = { id: string; etat: string; mandant_nom: string };
export type RapportCompta = {
  id: string;
  mandat_id: string;
  mois: string;
  statut: string;
  net: number;
  versement_montant: number | null;
};

export function RapportsGestion({
  orgId,
  mandats,
  rapports,
  moisCourant,
}: {
  orgId: string;
  mandats: MandatCompta[];
  rapports: RapportCompta[];
  moisCourant: string;
}) {
  // Un mandat en préavis ou résilié ne génère plus de rapport, mais ses
  // rapports non versés restent visibles jusqu'au solde.
  const visibles = mandats
    .map((m) => {
      const actif = m.etat === "actif";
      const rs = rapports.filter(
        (r) => r.mandat_id === m.id && (actif || r.versement_montant == null)
      );
      return { m, actif, rs };
    })
    .filter(({ actif, rs }) => actif || rs.length > 0);
  if (visibles.length === 0)
    return (
      <div className="vide-guide">
        <p className="titre">Aucun mandat de gestion actif</p>
        <p className="explication">
          Un rapport de gestion se rend à un mandant : il se génère par mandat,
          une fois le mois clôturé. Créez un mandat depuis la fiche du
          propriétaire pour voir apparaître ses rapports ici.
        </p>
      </div>
    );
  return (
    <div className="space-y-4">
      {visibles.map(({ m, actif, rs }) => {
        return (
          <div key={m.id} className="space-y-2 border border-border p-3">
            <p className="text-sm font-medium">
              {m.mandant_nom}
              {!actif && (
                <span className="ml-2 puce puce-prep font-normal">
                  {m.etat === "preavis" ? "préavis" : "résilié"}
                </span>
              )}
            </p>
            {rs.length > 0 && (
              <ul className="space-y-1 text-sm">
                {rs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="sm:w-28 sm:shrink-0">{moisEnFrancais(r.mois)}</span>
                    <span className="montant sm:w-28 sm:shrink-0">net {eur(r.net)}</span>
                    {/* Cycle du rapport : à valider → envoyé → versé */}
                    <span
                      className={
                        r.statut === "a_valider"
                          ? "puce puce-prep"
                          : r.versement_montant == null
                            ? "puce puce-encre"
                            : "puce puce-loue"
                      }
                    >
                      {r.statut === "a_valider"
                        ? "À valider"
                        : r.versement_montant == null
                          ? "Envoyé"
                          : "Versé"}
                    </span>
                    {r.statut === "a_valider" ? (
                      <BoutonEnvoyerRapport orgId={orgId} rapportId={r.id} />
                    ) : r.versement_montant == null ? (
                      <FormVersement orgId={orgId} rapportId={r.id} />
                    ) : (
                      <span className="montant text-xs text-muted-foreground">
                        versé {eur(r.versement_montant)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {actif && (
              <BoutonGenererRapport orgId={orgId} mandatId={m.id} moisCourant={moisCourant} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BoutonGenererRapport({ orgId, mandatId, moisCourant }: { orgId: string; mandatId: string; moisCourant: string }) {
  const [etat, action] = useActionState<EtatCompta, FormData>(genererRapport.bind(null, orgId, mandatId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08).
          Ces champs en ligne n'ont pas la place d'une étiquette visible : ils
          en portent une pour le lecteur d'écran, jamais rien du tout — un
          formulaire d'ARGENT ne se devine pas au seul texte de son bouton. */}
      <Input
        aria-label="Mois du rapport de gestion"
        name="mois"
        type="month"
        defaultValue={etat.valeurs?.mois ?? dernierMoisRevolu(moisCourant)}
        className="h-8 text-xs"
      />
      <BoutonEnvoi size="sm" variant="outline">
        Générer le rapport
      </BoutonEnvoi>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-xs text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

function BoutonEnvoyerRapport({ orgId, rapportId }: { orgId: string; rapportId: string }) {
  const [etat, action] = useActionState<EtatCompta, FormData>(envoyerRapport.bind(null, orgId, rapportId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <Input
        aria-label="Commentaire joint au rapport"
        name="commentaire"
        placeholder="commentaire"
        defaultValue={etat.valeurs?.commentaire}
        className="h-8 w-32 text-xs"
      />
      <BoutonEnvoi size="sm" variant="ghost">Valider & envoyer</BoutonEnvoi>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
      {/* Le succès peut porter une réserve (mandant sans email, envoi manqué) */}
      {etat.succes && <span className="text-xs text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

function FormVersement({ orgId, rapportId }: { orgId: string; rapportId: string }) {
  const [etat, action] = useActionState<EtatCompta, FormData>(enregistrerVersement.bind(null, orgId, rapportId), {});
  // InputDateJour ne prend pas d'aria-label : son étiquette passe par un
  // <label> masqué visuellement. Les identifiants portent le rapport — un
  // écran en aligne autant qu'il y a de mois à verser.
  const idDate = `vers-date-${rapportId}`;
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <Input
        aria-label="Montant versé, en euros"
        name="montant"
        type="number"
        inputMode="decimal"
        step="0.01"
        placeholder="versé €"
        defaultValue={etat.valeurs?.montant}
        className="h-8 w-24 text-xs"
      />
      <Label htmlFor={idDate} className="sr-only">
        Date du versement
      </Label>
      <InputDateJour id={idDate} className="h-8 text-xs" name="date" />
      <BoutonEnvoi size="sm" variant="ghost">Versement</BoutonEnvoi>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

export function FormulaireEcriture({
  orgId,
  lots,
}: {
  orgId: string;
  lots: { id: string; nom: string }[];
}) {
  const [etat, action] = useActionState<EtatCompta, FormData>(
    ajouterEcriture.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08).
          Sous sm, chaque champ prend sa pleine largeur : une colonne lisible
          plutôt que des rangées irrégulières. */}
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-sens" className="text-xs">Sens</Label>
        <select id="ec-sens" name="sens" defaultValue={etat.valeurs?.sens ?? "depense"} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm sm:w-auto">
          <option value="recette">Recette</option>
          <option value="depense">Dépense</option>
        </select>
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-lot" className="text-xs">Lot (recommandé)</Label>
        <select id="ec-lot" name="lot_id" defaultValue={etat.valeurs?.lot_id ?? ""} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm sm:w-auto sm:max-w-48">
          <option value="">— Aucun lot —</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>{l.nom}</option>
          ))}
        </select>
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-cat" className="text-xs">Catégorie</Label>
        <Input id="ec-cat" name="categorie" placeholder="travaux, charges…" defaultValue={etat.valeurs?.categorie} className="h-9 w-full sm:w-36" />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-montant" className="text-xs">Montant (€)</Label>
        <Input id="ec-montant" name="montant" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={etat.valeurs?.montant} className="h-9 w-full sm:w-28" />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-piece" className="text-xs">Date pièce</Label>
        <InputDateJour id="ec-piece"   className="h-9 w-full sm:w-auto" name="date_piece" />
      </div>
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-imput" className="text-xs">Imputation</Label>
        <InputDateJour id="ec-imput"   className="h-9 w-full sm:w-auto" name="date_imputation" />
      </div>
      {/* Seul champ du formulaire à n'avoir eu qu'un placeholder : il porte
          désormais la même étiquette que ses six voisins. */}
      <div className="w-full space-y-1 sm:w-auto">
        <Label htmlFor="ec-libelle" className="text-xs">Libellé (facultatif)</Label>
        <Input id="ec-libelle" name="libelle" defaultValue={etat.valeurs?.libelle} className="h-9 w-full sm:w-40" />
      </div>
      <BoutonEnvoi size="sm" variant="outline">
        {"Ajouter l'écriture"}
      </BoutonEnvoi>
      <p className="w-full text-xs text-muted-foreground">
        Sans lot, l&apos;écriture n&apos;entre dans aucun rapport de gestion ni
        dans le périmètre d&apos;un agent.
      </p>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

export function FormulaireVentilation({
  orgId,
  biens,
}: {
  orgId: string;
  biens: { id: string; nom: string }[];
}) {
  const [etat, action] = useActionState<EtatCompta, FormData>(
    ventilerDepense.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
      <div className="space-y-1">
        <Label htmlFor="v-bien" className="text-xs">Bien</Label>
        {/* max-w : un nom de bien long ne doit pas élargir la page (le select
            natif prend sinon la largeur de sa plus longue option) */}
        <select id="v-bien" name="bien_id" defaultValue={etat.valeurs?.bien_id ?? ""} className="h-9 max-w-48 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="" disabled>Choisir…</option>
          {biens.map((b) => (
            <option key={b.id} value={b.id}>{b.nom}</option>
          ))}
        </select>
      </div>
      {/* Trois champs sur cinq n'avaient qu'un placeholder — qui disparaît dès
          la première frappe et n'est pas une étiquette. Le formulaire de
          ventilation étiquette maintenant comme celui de l'écriture. */}
      <div className="space-y-1">
        <Label htmlFor="v-cat" className="text-xs">Catégorie</Label>
        <Input id="v-cat" name="categorie" placeholder="travaux…" defaultValue={etat.valeurs?.categorie} className="h-9 w-36" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="v-montant" className="text-xs">Montant (€)</Label>
        <Input id="v-montant" name="montant" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={etat.valeurs?.montant} className="h-9 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="v-piece" className="text-xs">Date pièce</Label>
        <InputDateJour id="v-piece"   className="h-9" name="date_piece" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="v-libelle" className="text-xs">Libellé (facultatif)</Label>
        <Input id="v-libelle" name="libelle" defaultValue={etat.valeurs?.libelle} className="h-9 w-36" />
      </div>
      <BoutonEnvoi size="sm" variant="outline">
        Ventiler la dépense
      </BoutonEnvoi>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function FormulaireCloture({ orgId, moisCourant }: { orgId: string; moisCourant: string }) {
  const [etat, action] = useActionState<EtatCompta, FormData>(
    cloturerMois.bind(null, orgId),
    {}
  );
  // On ne clôture qu'un mois révolu (RM-4.4.1) : le champ propose — et n'accepte
  // pas au-delà de — le dernier mois terminé. Proposer le mois en cours menait
  // droit au refus de la base, et surtout invitait à figer un mois incomplet.
  const dernierRevolu = dernierMoisRevolu(moisCourant);
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="clot-mois" className="text-xs">Mois</Label>
        <Input
          id="clot-mois"
          name="mois"
          type="month"
          max={dernierRevolu}
          defaultValue={etat.valeurs?.mois ?? dernierRevolu}
          className="h-9"
        />
      </div>
      <BoutonEnvoi size="sm" variant="outline">
        Clôturer le mois
      </BoutonEnvoi>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function BoutonContre({ orgId, ecritureId }: { orgId: string; ecritureId: string }) {
  const [etat, action] = useActionState<EtatCompta, FormData>(
    passerContreEcriture.bind(null, orgId, ecritureId),
    {}
  );
  return (
    // « Contre-écriture » côtoyait des lignes elles-mêmes étiquetées
    // « contre-écriture » : le même mot pour l'action et pour son résultat.
    // Le bouton dit ce qu'il fait, l'étiquette dit ce que la ligne est.
    <form action={action} className="flex flex-wrap items-center gap-1">
      <Input
        aria-label="Motif de l’annulation"
        name="motif"
        placeholder="motif"
        defaultValue={etat.valeurs?.motif}
        className="h-8 w-28 text-xs"
      />
      <BoutonEnvoi size="sm" variant="ghost">
        Annuler
      </BoutonEnvoi>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}
