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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const eurC = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;

export type MandatCompta = { id: string; mandant_nom: string };
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
  if (mandats.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun mandat de gestion actif. Un rapport se génère par mandat : créez-en un depuis la fiche du propriétaire.</p>;
  return (
    <div className="space-y-4">
      {mandats.map((m) => {
        const rs = rapports.filter((r) => r.mandat_id === m.id);
        return (
          <div key={m.id} className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{m.mandant_nom}</p>
            {rs.length > 0 && (
              <ul className="space-y-1 text-sm">
                {rs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-28 shrink-0">{r.mois.slice(0, 7)}</span>
                    <span className="w-28 shrink-0">net {eurC(r.net)}</span>
                    <span className="badge-statut text-muted-foreground">
                      {r.statut === "envoye" ? "Envoyé" : "À valider"}
                    </span>
                    {r.statut === "a_valider" ? (
                      <BoutonEnvoyerRapport orgId={orgId} rapportId={r.id} />
                    ) : r.versement_montant == null ? (
                      <FormVersement orgId={orgId} rapportId={r.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">versé {eurC(r.versement_montant)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <BoutonGenererRapport orgId={orgId} mandatId={m.id} moisCourant={moisCourant} />
          </div>
        );
      })}
    </div>
  );
}

function BoutonGenererRapport({ orgId, mandatId, moisCourant }: { orgId: string; mandatId: string; moisCourant: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(genererRapport.bind(null, orgId, mandatId), {});
  return (
    <form action={action} className="flex items-end gap-2">
      <Input name="mois" type="month" defaultValue={moisCourant} className="h-8 text-sm" />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Générer le rapport"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-xs text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

function BoutonEnvoyerRapport({ orgId, rapportId }: { orgId: string; rapportId: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(envoyerRapport.bind(null, orgId, rapportId), {});
  return (
    <form action={action} className="flex items-center gap-1">
      <Input name="commentaire" placeholder="commentaire" className="h-7 w-32 text-xs" />
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>Valider & envoyer</Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

function FormVersement({ orgId, rapportId }: { orgId: string; rapportId: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(enregistrerVersement.bind(null, orgId, rapportId), {});
  return (
    <form action={action} className="flex items-center gap-1">
      <Input name="montant" type="number" step="0.01" placeholder="versé €" className="h-7 w-24 text-xs" />
      <InputDateJour   className="h-7 text-xs" name="date" />
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>Versement</Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

export function FormulaireEcriture({ orgId }: { orgId: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    ajouterEcriture.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="ec-sens" className="text-xs">Sens</Label>
        <select id="ec-sens" name="sens" defaultValue="depense" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="recette">Recette</option>
          <option value="depense">Dépense</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-cat" className="text-xs">Catégorie</Label>
        <Input id="ec-cat" name="categorie" placeholder="travaux, charges…" className="h-9 w-36" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-montant" className="text-xs">Montant (€)</Label>
        <Input id="ec-montant" name="montant" type="number" step="0.01" min="0.01" className="h-9 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-piece" className="text-xs">Date pièce</Label>
        <InputDateJour id="ec-piece"   className="h-9" name="date_piece" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-imput" className="text-xs">Imputation</Label>
        <InputDateJour id="ec-imput"   className="h-9" name="date_imputation" />
      </div>
      <Input name="libelle" placeholder="Libellé (facultatif)" className="h-9 w-40" />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Ajouter l'écriture"}
      </Button>
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
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    ventilerDepense.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="v-bien" className="text-xs">Bien</Label>
        <select id="v-bien" name="bien_id" defaultValue="" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="" disabled>Choisir…</option>
          {biens.map((b) => (
            <option key={b.id} value={b.id}>{b.nom}</option>
          ))}
        </select>
      </div>
      <Input name="categorie" placeholder="Catégorie (travaux…)" className="h-9 w-36" />
      <Input name="montant" type="number" step="0.01" min="0.01" placeholder="Montant €" className="h-9 w-28" />
      <div className="space-y-1">
        <Label htmlFor="v-piece" className="text-xs">Date pièce</Label>
        <InputDateJour id="v-piece"   className="h-9" name="date_piece" />
      </div>
      <Input name="libelle" placeholder="Libellé" className="h-9 w-36" />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Ventiler la dépense"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function FormulaireCloture({ orgId, moisCourant }: { orgId: string; moisCourant: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    cloturerMois.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="clot-mois" className="text-xs">Mois</Label>
        <Input id="clot-mois" name="mois" type="month" defaultValue={moisCourant} className="h-9" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Clôturer le mois"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function BoutonContre({ orgId, ecritureId }: { orgId: string; ecritureId: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    passerContreEcriture.bind(null, orgId, ecritureId),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-1">
      <Input name="motif" placeholder="motif" className="h-7 w-28 text-xs" />
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        Contre-écriture
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}
