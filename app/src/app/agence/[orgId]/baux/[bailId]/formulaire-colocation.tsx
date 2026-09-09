"use client";

import { useActionState } from "react";
import {
  ajouterBailPersonne,
  supprimerBailPersonne,
  type EtatBail,
} from "@/app/actions/baux";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
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

// L'erreur de l'action s'affiche sous la ligne — avant, elle était jetée
// (audit vie du bail 09/09).
function BoutonRetirer({ orgId, bailId, ligneId }: { orgId: string; bailId: string; ligneId: string }) {
  const [etat, formAction] = useActionState<EtatBail, FormData>(
    () => supprimerBailPersonne(orgId, bailId, ligneId),
    {}
  );
  return (
    <>
      <form action={formAction}>
        <BoutonEnvoi variant="ghost" size="sm">
          Retirer
        </BoutonEnvoi>
      </form>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </>
  );
}

export function FormulaireColocation({
  orgId,
  bailId,
  personnes,
  lignes,
  principal,
  colocation,
}: {
  orgId: string;
  bailId: string;
  personnes: Personne[];
  lignes: LigneColoc[];
  principal: Personne;
  // Hors colocation (bail nu/meublé), seule la partie Garants est rendue :
  // tout bail peut porter des garants, seuls les colocataires sont propres
  // au bail unique de colocation.
  colocation: boolean;
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
  const [etatC, formColoc] = useActionState<EtatBail, FormData>(actionColoc, {});
  const actionGarant = ajouterBailPersonne.bind(null, orgId, bailId);
  const [etatG, formGarant] = useActionState<EtatBail, FormData>(actionGarant, {});

  const totalQp =
    colocataires.reduce((s, c) => s + (c.quote_part ?? 0), 0);

  return (
    <div className="space-y-5">
      {colocation && (
        <p className="text-xs text-muted-foreground">
          Bail unique : un seul appel de loyer, jamais fractionné. Les
          quotes-parts servent à la répartition interne et aux attestations CAF.
          Locataire principal (référent) : <span className="font-medium">{principal.nom}</span>.
        </p>
      )}

      {/* Colocataires — propres au bail unique de colocation */}
      {colocation && (
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
          <p className="text-sm text-muted-foreground">Aucun colocataire ajouté pour l&apos;instant — seul le locataire principal figure au bail.</p>
        ) : (
          <ul className="divide-y divide-border">
            {colocataires.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
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
            {/* En erreur, la saisie est reposée via etatC.valeurs (recette 22/08) */}
            <select
              id="coloc-person"
              name="person_id"
              defaultValue={etatC.valeurs?.person_id ?? ""}
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
            <Input id="coloc-qp" name="quote_part" type="number" min="0.01" max="100" step="0.01" defaultValue={etatC.valeurs?.quote_part} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coloc-surf" className="text-xs">
              Surface privée (m²)
            </Label>
            <Input id="coloc-surf" name="surface_privative" type="number" min="0.01" step="0.01" defaultValue={etatC.valeurs?.surface_privative} />
          </div>
          <div className="sm:col-span-4">
            <BoutonEnvoi enCoursTexte="Ajout…" size="sm" variant="outline">
              Ajouter le colocataire
            </BoutonEnvoi>
            {etatC.erreur && <p className="mt-1 text-sm text-destructive">{etatC.erreur}</p>}
          </div>
        </form>
      </div>
      )}

      {/* Garants */}
      <div className={colocation ? "space-y-2 border-t border-border pt-4" : "space-y-2"}>
        <p className="text-sm font-medium">Garants</p>
        {garants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun garant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {garants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
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
            {/* En erreur, la saisie est reposée via etatG.valeurs (recette 22/08) */}
            <select
              id="garant-person"
              name="person_id"
              defaultValue={etatG.valeurs?.person_id ?? ""}
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
              {colocation ? "Couvre le colocataire" : "Couvre le locataire"}
            </Label>
            {/* Hors colocation, un seul couvrable (le locataire principal) :
                pré-sélectionné plutôt que de forcer un choix évident */}
            <select
              id="garant-de"
              name="garant_de"
              defaultValue={
                etatG.valeurs?.garant_de ??
                (!colocation && couvrables.length === 1 ? couvrables[0].id : "")
              }
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
            <BoutonEnvoi enCoursTexte="Ajout…" size="sm" variant="outline">
              Ajouter le garant
            </BoutonEnvoi>
            {etatG.erreur && <p className="mt-1 text-sm text-destructive">{etatG.erreur}</p>}
          </div>
        </form>
        {colocation ? (
          <p className="text-xs text-muted-foreground">
            Garant nominatif (couvre un colocataire) ; avec clause de solidarité, il
            peut être appelé au-delà de sa part. Engagement plafonné à 6 mois après le
            départ du colocataire couvert (loi ALUR).
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Le garant s&apos;engage par un acte de cautionnement, à générer depuis la
            carte « Cautionnement » une fois le garant rattaché au bail.
          </p>
        )}
      </div>
    </div>
  );
}
