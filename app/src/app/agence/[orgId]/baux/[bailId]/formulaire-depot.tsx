"use client";

import { eur, formaterDate } from "@/lib/ged";
import { InputDateJour } from "@/components/input-date-jour";

import { useActionState } from "react";
import { encaisserDepot, supprimerEncaissementDepot, type EtatDepot } from "@/app/actions/depot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EncaissementDepot = {
  id: string;
  montant: number;
  date_encaissement: string;
  moyen: string | null;
  versant_libelle: string | null;
  versant_person_id: string | null;
};

export function FormulaireDepot({
  orgId,
  bailId,
  depotDu,
  encaissements,
  personnes,
  locataireNom,
}: {
  orgId: string;
  bailId: string;
  depotDu: number;
  encaissements: EncaissementDepot[];
  personnes: { id: string; nom: string }[];
  locataireNom: string;
}) {
  const encaisse = encaissements.reduce((s, e) => s + Number(e.montant), 0);
  const reste = depotDu - encaisse;
  const nom = (id: string | null, libelle: string | null) =>
    id ? personnes.find((p) => p.id === id)?.nom ?? "Tiers" : libelle || locataireNom;

  if (depotDu <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun dépôt de garantie prévu au bail — la garantie Visale peut s&apos;y substituer.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-x-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Dépôt dû</dt>
          <dd className="font-medium">{eur(depotDu)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Encaissé</dt>
          <dd className="font-medium">{eur(encaisse)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Reste dû</dt>
          <dd className="font-medium">{eur(reste)}</dd>
        </div>
      </dl>

      {reste <= 0 ? (
        <p className="text-sm text-success-soft-foreground">Dépôt intégralement encaissé.</p>
      ) : encaisse > 0 ? (
        <p className="text-sm text-warning-soft-foreground">
          Encaissement partiel : reste {eur(reste)} à percevoir.
        </p>
      ) : null}

      {encaissements.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {encaissements.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-right font-medium">{eur(e.montant)}</span>
              <span className="text-xs text-muted-foreground">
                {formaterDate(e.date_encaissement)}
                {e.moyen ? ` · ${e.moyen}` : ""} · versé par {nom(e.versant_person_id, e.versant_libelle)}
              </span>
              <span className="ml-auto">
                <BoutonSupprimer orgId={orgId} bailId={bailId} encId={e.id} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {reste > 0 && (
        <FormEncaisser
          orgId={orgId}
          bailId={bailId}
          reste={reste}
          personnes={personnes}
        />
      )}
    </div>
  );
}

function FormEncaisser({
  orgId,
  bailId,
  reste,
  personnes,
}: {
  orgId: string;
  bailId: string;
  reste: number;
  personnes: { id: string; nom: string }[];
}) {
  const [etat, action, enCours] = useActionState<EtatDepot, FormData>(
    encaisserDepot.bind(null, orgId, bailId),
    {}
  );
  return (
    <form action={action} className="space-y-2 border border-dashed border-border p-3">
      <p className="text-sm font-medium">Enregistrer un encaissement</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="dep-montant" className="text-xs">Montant (€)</Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
          <Input
            id="dep-montant"
            name="montant"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={etat.valeurs?.montant ?? reste}
            className="h-9 w-28"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dep-date" className="text-xs">Date</Label>
          <InputDateJour id="dep-date"   className="h-9" name="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dep-moyen" className="text-xs">Moyen</Label>
          <Input id="dep-moyen" name="moyen" placeholder="virement, chèque…" defaultValue={etat.valeurs?.moyen} className="h-9 w-36" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="dep-versant" className="text-xs">Versé par (si tiers)</Label>
          <select
            id="dep-versant"
            name="versant_person"
            defaultValue={etat.valeurs?.versant_person ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Le locataire</option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>
        </div>
        <Input name="versant_libelle" placeholder="ou tiers hors fiche" defaultValue={etat.valeurs?.versant_libelle} className="h-9 w-44" />
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? "…" : "Encaisser"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Le montant total est plafonné au dépôt du bail ; le dépôt n&apos;est jamais
        révisé en cours de bail.
      </p>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

function BoutonSupprimer({
  orgId,
  bailId,
  encId,
}: {
  orgId: string;
  bailId: string;
  encId: string;
}) {
  const [, action, enCours] = useActionState(
    async () => supprimerEncaissementDepot(orgId, bailId, encId),
    {}
  );
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="ghost" disabled={enCours} className="text-xs text-destructive">
        Retirer
      </Button>
    </form>
  );
}
