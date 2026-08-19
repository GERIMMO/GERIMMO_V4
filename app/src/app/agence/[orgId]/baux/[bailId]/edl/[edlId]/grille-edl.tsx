"use client";

import { useActionState } from "react";
import { majGrilleEdl, signerEdl, type EtatEdl } from "@/app/actions/edl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ETATS_ELEMENT: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon",
  usage: "Usagé",
  mauvais: "Mauvais",
  absent: "Absent",
};

// Puces charte v2 : neuf/bon acquis, usagé neutre, mauvais/absent alertent
export const COULEURS_ETAT_ELEMENT: Record<string, string> = {
  neuf: "puce puce-loue",
  bon: "puce puce-loue",
  usage: "puce puce-grise",
  mauvais: "puce puce-rouge",
  absent: "puce puce-rouge",
};

type Ligne = {
  id: string;
  categorie: string;
  piece: string | null;
  libelle: string;
  etat: string | null;
  commentaire: string | null;
};

// Regroupe les lignes par pièce (ou « Équipements » / « Général » pour les lignes
// sans pièce), en préservant l'ordre d'apparition.
function grouper(lignes: Ligne[]): { titre: string; lignes: Ligne[] }[] {
  const groupes: { titre: string; lignes: Ligne[] }[] = [];
  const index = new Map<string, number>();
  for (const l of lignes) {
    const titre = l.piece ?? (l.categorie === "equipement" ? "Équipements" : "Général");
    if (!index.has(titre)) {
      index.set(titre, groupes.length);
      groupes.push({ titre, lignes: [] });
    }
    groupes[index.get(titre)!].lignes.push(l);
  }
  return groupes;
}

export function GrilleEdl({
  orgId,
  bailId,
  edlId,
  lignes,
  signe,
}: {
  orgId: string;
  bailId: string;
  edlId: string;
  lignes: Ligne[];
  signe: boolean;
}) {
  const actionMaj = majGrilleEdl.bind(null, orgId, bailId, edlId);
  const [etatMaj, formMaj, enCoursMaj] = useActionState<EtatEdl, FormData>(actionMaj, {});
  const actionSigne = signerEdl.bind(null, orgId, bailId, edlId);
  const [etatSigne, formSigne, enCoursSigne] = useActionState<EtatEdl, FormData>(actionSigne, {});

  if (signe) {
    return (
      <div className="space-y-3">
        {grouper(lignes).map((g) => (
          <div key={g.titre} className="space-y-1">
            <p className="mono-discret">{g.titre}</p>
            {g.lignes.map((l) => (
              <div key={l.id} className="flex items-center gap-3 border-b border-border py-1.5 text-sm">
                <span className="w-40 shrink-0 truncate">{l.libelle}</span>
                <span className={(l.etat && COULEURS_ETAT_ELEMENT[l.etat]) || "puce puce-grise"}>
                  {l.etat ? ETATS_ELEMENT[l.etat] ?? l.etat : "—"}
                </span>
                {l.commentaire && (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.commentaire}</span>
                )}
              </div>
            ))}
          </div>
        ))}
        <p className="pt-3 text-sm text-success-soft-foreground">
          État des lieux signé et figé — plus aucune modification possible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={formMaj} className="space-y-3">
        {grouper(lignes).map((g) => (
          <div key={g.titre} className="space-y-1">
            <p className="mono-discret">{g.titre}</p>
            {g.lignes.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5">
                <span className="w-36 shrink-0 truncate text-sm">{l.libelle}</span>
                <select
                  name={`etat_${l.id}`}
                  defaultValue={l.etat ?? ""}
                  className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">— état —</option>
                  {Object.entries(ETATS_ELEMENT).map(([v, lib]) => (
                    <option key={v} value={v}>
                      {lib}
                    </option>
                  ))}
                </select>
                <Input
                  name={`commentaire_${l.id}`}
                  defaultValue={l.commentaire ?? ""}
                  placeholder="commentaire"
                  className="h-8 min-w-40 flex-1 text-sm"
                />
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-3">
          <Button type="submit" size="sm" variant="outline" disabled={enCoursMaj}>
            {enCoursMaj ? "Enregistrement…" : "Enregistrer la grille"}
          </Button>
          {etatMaj.succes && (
            <span className="text-sm text-success-soft-foreground">{etatMaj.succes}</span>
          )}
          {etatMaj.erreur && <span className="text-sm text-destructive">{etatMaj.erreur}</span>}
        </div>
      </form>

      <form action={formSigne} className="border-t border-border pt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          La signature fige l&apos;état des lieux : chaque ligne doit avoir un état.
        </p>
        <Button type="submit" size="sm" disabled={enCoursSigne}>
          {enCoursSigne ? "Signature…" : "Signer l'état des lieux"}
        </Button>
        {etatSigne.erreur && <p className="mt-1 text-sm text-destructive">{etatSigne.erreur}</p>}
      </form>
    </div>
  );
}
