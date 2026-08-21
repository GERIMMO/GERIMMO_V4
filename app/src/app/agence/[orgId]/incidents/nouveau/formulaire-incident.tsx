"use client";

import { useActionState, useState } from "react";
import { ouvrirIncident, type EtatIncidentAction } from "@/app/actions/incidents";
import {
  categorieIncident,
  CATEGORIES_INCIDENT,
  IMPUTATIONS_INCIDENT,
  PIECES_INCIDENT,
} from "@/lib/incidents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// Repère juridique de la catégorie choisie : une information pour l'agent,
// jamais une pré-sélection (RM-7.2.1)
export function RepereJuridique({ slug }: { slug: string }) {
  const repere = categorieIncident(slug)?.repere;
  if (!repere) return null;
  return (
    <p className="text-[0.8125rem] text-muted-foreground">
      Repère : en général{" "}
      <span className="font-medium">
        {IMPUTATIONS_INCIDENT[repere.charge]?.toLowerCase()}
      </span>{" "}
      — {repere.fondement}. C&apos;est vous qui tranchez à la qualification.
    </p>
  );
}

export function FormulaireIncident({
  orgId,
  lots,
}: {
  orgId: string;
  lots: { id: string; libelle: string }[];
}) {
  const actionLiee = ouvrirIncident.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const [categorie, setCategorie] = useState("");

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="lot">Lot concerné *</Label>
        <select id="lot" name="lot" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            Choisissez le lot…
          </option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.libelle}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categorie">Catégorie *</Label>
        <select
          id="categorie"
          name="categorie"
          required
          defaultValue=""
          className={classeSelect}
          onChange={(e) => setCategorie(e.target.value)}
        >
          <option value="" disabled>
            La catégorie la plus proche…
          </option>
          {CATEGORIES_INCIDENT.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.libelle}
            </option>
          ))}
        </select>
        <RepereJuridique slug={categorie} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="piece">Pièce concernée</Label>
          <select id="piece" name="piece" defaultValue="" className={classeSelect}>
            <option value="">—</option>
            {PIECES_INCIDENT.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="urgence">Urgence</Label>
          <select id="urgence" name="urgence" defaultValue="normale" className={classeSelect}>
            <option value="normale">Normal — peut attendre quelques jours</option>
            <option value="urgente">Urgent — dégât en cours ou logement inutilisable</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description *</Label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          placeholder="Ce que décrit le locataire : où exactement, depuis quand, est-ce que cela s'aggrave…"
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="anciennete">Depuis quand ?</Label>
        <Input
          id="anciennete"
          name="anciennete"
          placeholder="« Depuis dimanche, ça s'étend »"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photos">Photos (5 max, JPEG ou PNG)</Label>
        <Input id="photos" name="photos" type="file" accept="image/jpeg,image/png" multiple />
      </div>

      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      {etat.avertissement && (
        <p className="text-sm text-warning-soft-foreground">{etat.avertissement}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Ouverture…" : "Ouvrir l'incident"}
        </Button>
        <span className="text-xs text-muted-foreground">* champs obligatoires</span>
      </div>
    </form>
  );
}
