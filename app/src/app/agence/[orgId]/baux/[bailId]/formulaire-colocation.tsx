"use client";

import { useActionState } from "react";
import {
  ajouterBailPersonne,
  supprimerBailPersonne,
  type EtatBail,
} from "@/app/actions/baux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LigneColoc = {
  id: string;
  person_id: string;
  person_nom: string;
  role: string;
  quote_part: number | null;
  surface_privative: number | null;
  garant_de: string | null;
  garant_de_nom: string | null;
};

type Personne = { id: string; nom: string };

function BoutonRetirer({ orgId, bailId, ligneId }: { orgId: string; bailId: string; ligneId: string }) {
  return (
    <form
      action={async () => {
        await supprimerBailPersonne(orgId, bailId, ligneId);
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Retirer
      </Button>
    </form>
  );
}

export function FormulaireColocation({
  orgId,
  bailId,
  personnes,
  lignes,
  principal,
}: {
  orgId: string;
  bailId: string;
  personnes: Personne[];
  lignes: LigneColoc[];
  principal: Personne;
}) {
  const colocataires = lignes.filter((l) => l.role === "colocataire");
  const garants = lignes.filter((l) => l.role === "garant");

  const dejaIds = new Set<string>([principal.id, ...lignes.map((l) => l.person_id)]);
  const dispo = personnes.filter((p) => !dejaIds.has(p.id));
  // Un garant couvre le principal ou l'un des colocataires (nominatif)
  const couvrables: Personne[] = [
    principal,
    ...colocataires.map((c) => ({ id: c.person_id, nom: c.person_nom })),
  ];

  const actionColoc = ajouterBailPersonne.bind(null, orgId, bailId);
  const [etatC, formColoc, enCoursC] = useActionState<EtatBail, FormData>(actionColoc, {});
  const actionGarant = ajouterBailPersonne.bind(null, orgId, bailId);
  const [etatG, formGarant, enCoursG] = useActionState<EtatBail, FormData>(actionGarant, {});

  const totalQp =
    colocataires.reduce((s, c) => s + (c.quote_part ?? 0), 0);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Bail unique : un seul appel de loyer, jamais fractionné (RM-1.3.1). Les
        quotes-parts servent à la répartition interne et aux attestations CAF.
        Locataire principal (référent) : <span className="font-medium">{principal.nom}</span>.
      </p>

      {/* Colocataires */}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Colocataires{" "}
          {colocataires.length > 0 && (
            <span className="text-xs text-muted-foreground">
              — quote-part cumulée {totalQp} %
            </span>
          )}
        </p>
        {colocataires.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun colocataire ajouté.</p>
        ) : (
          <ul className="divide-y divide-border">
            {colocataires.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.person_nom}</span>
                {c.quote_part != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">{c.quote_part} %</span>
                )}
                {c.surface_privative != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.surface_privative} m²
                  </span>
                )}
                <BoutonRetirer orgId={orgId} bailId={bailId} ligneId={c.id} />
              </li>
            ))}
          </ul>
        )}
        <form action={formColoc} className="grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="role" value="colocataire" />
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="coloc-person" className="text-xs">
              Personne
            </Label>
            <select
              id="coloc-person"
              name="person_id"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="" disabled>
                Choisir…
              </option>
              {dispo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="coloc-qp" className="text-xs">
              Quote-part %
            </Label>
            <Input id="coloc-qp" name="quote_part" type="number" min="0" max="100" step="0.01" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coloc-surf" className="text-xs">
              Surface privée (m²)
            </Label>
            <Input id="coloc-surf" name="surface_privative" type="number" min="0" step="0.01" />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" size="sm" variant="outline" disabled={enCoursC}>
              {enCoursC ? "Ajout…" : "Ajouter le colocataire"}
            </Button>
            {etatC.erreur && <p className="mt-1 text-sm text-destructive">{etatC.erreur}</p>}
          </div>
        </form>
      </div>

      {/* Garants */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Garants</p>
        {garants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun garant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {garants.map((g) => (
              <li key={g.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {g.person_nom}
                  {g.garant_de_nom && (
                    <span className="text-muted-foreground"> — couvre {g.garant_de_nom}</span>
                  )}
                </span>
                <BoutonRetirer orgId={orgId} bailId={bailId} ligneId={g.id} />
              </li>
            ))}
          </ul>
        )}
        <form action={formGarant} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="role" value="garant" />
          <div className="space-y-1">
            <Label htmlFor="garant-person" className="text-xs">
              Garant
            </Label>
            <select
              id="garant-person"
              name="person_id"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="" disabled>
                Choisir…
              </option>
              {dispo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="garant-de" className="text-xs">
              Couvre le colocataire
            </Label>
            <select
              id="garant-de"
              name="garant_de"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="" disabled>
                Choisir…
              </option>
              {couvrables.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" variant="outline" disabled={enCoursG}>
              {enCoursG ? "Ajout…" : "Ajouter le garant"}
            </Button>
            {etatG.erreur && <p className="mt-1 text-sm text-destructive">{etatG.erreur}</p>}
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          Garant nominatif (couvre un colocataire) ; avec clause de solidarité, il
          peut être appelé au-delà de sa part. Engagement plafonné à 6 mois après le
          départ du colocataire couvert (loi ALUR).
        </p>
      </div>
    </div>
  );
}
