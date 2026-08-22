"use client";

import { useActionState } from "react";
import {
  ajouterInventaireLigne,
  supprimerInventaireLigne,
  type EtatBail,
} from "@/app/actions/baux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LigneInventaire = {
  id: string;
  piece: string | null;
  designation: string;
  quantite: number;
  etat: string | null;
  observation: string | null;
};

// Mobilier minimum imposé par le décret 2015-1437 (bail meublé) — rappel non bloquant.
const CATEGORIES_DECRET = [
  "Literie (couette/couverture)",
  "Occultation fenêtres (chambres)",
  "Plaques de cuisson",
  "Four ou micro-ondes",
  "Réfrigérateur / congélateur",
  "Vaisselle suffisante",
  "Ustensiles de cuisine",
  "Table et sièges",
  "Étagères de rangement",
  "Luminaires",
  "Matériel d'entretien ménager",
];

const ETATS = ["neuf", "bon", "usage", "mauvais"];
const LIBELLE_ETAT: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon",
  usage: "Usagé",
  mauvais: "Mauvais",
};

function BoutonSupprimer({ orgId, bailId, ligneId }: { orgId: string; bailId: string; ligneId: string }) {
  return (
    <form
      action={async () => {
        await supprimerInventaireLigne(orgId, bailId, ligneId);
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Retirer
      </Button>
    </form>
  );
}

export function FormulaireInventaire({
  orgId,
  bailId,
  lignes,
}: {
  orgId: string;
  bailId: string;
  lignes: LigneInventaire[];
}) {
  const action = ajouterInventaireLigne.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});

  return (
    <div className="space-y-4">
      <div className="bg-muted p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">
          Mobilier minimum obligatoire (décret 2015-1437)
        </p>
        <p>{CATEGORIES_DECRET.join(" · ")}</p>
        <p className="mt-1">Un meublé incomplet expose à une requalification en bail nu.</p>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun meuble inventorié. L&apos;inventaire est une annexe obligatoire du bail meublé : ajoutez les meubles ci-dessous.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lignes.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {l.quantite > 1 && <span className="text-muted-foreground">{l.quantite}× </span>}
                {l.designation}
                {l.piece && <span className="text-muted-foreground"> — {l.piece}</span>}
                {l.observation && <span className="text-muted-foreground"> ({l.observation})</span>}
              </span>
              {l.etat && (
                <span className="puce puce-grise shrink-0">
                  {LIBELLE_ETAT[l.etat] ?? l.etat}
                </span>
              )}
              <BoutonSupprimer orgId={orgId} bailId={bailId} ligneId={l.id} />
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium">Ajouter un meuble</p>
        {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-designation" className="text-xs">
              Désignation
            </Label>
            <Input id="inv-designation" name="designation" required maxLength={120} placeholder="Canapé, lit 140, table…" defaultValue={etat.valeurs?.designation} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-piece" className="text-xs">
              Pièce
            </Label>
            <Input id="inv-piece" name="piece" maxLength={60} placeholder="Séjour, chambre 1…" defaultValue={etat.valeurs?.piece} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-quantite" className="text-xs">
              Quantité
            </Label>
            <Input id="inv-quantite" name="quantite" type="number" min={1} defaultValue={etat.valeurs?.quantite ?? 1} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-etat" className="text-xs">
              État
            </Label>
            <select
              id="inv-etat"
              name="etat"
              defaultValue={etat.valeurs?.etat ?? "bon"}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {ETATS.map((e) => (
                <option key={e} value={e}>
                  {LIBELLE_ETAT[e]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-obs" className="text-xs">
              Observation
            </Label>
            <Input id="inv-obs" name="observation" maxLength={200} placeholder="Rayure, tache… (facultatif)" defaultValue={etat.valeurs?.observation} />
          </div>
        </div>
        {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
        {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "Ajout…" : "Ajouter au mobilier"}
        </Button>
      </form>
    </div>
  );
}
