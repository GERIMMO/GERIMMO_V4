"use client";

import { useActionState } from "react";
import { enregistrerInfosPratiques, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type InfosPratiques = {
  sortie_poubelles: string | null;
  local_poubelles: string | null;
  gardien: string | null;
  travaux: string | null;
  stationnement: string | null;
  autres: string | null;
};

// Numéros d'urgence nationaux — fixes, identiques partout (bloc non éditable).
const URGENCES: [string, string][] = [
  ["17", "Police secours"],
  ["18", "Pompiers"],
  ["15", "SAMU (urgences médicales)"],
  ["112", "Numéro d'urgence européen"],
];

const CHAMPS: { nom: keyof InfosPratiques; label: string; aide: string }[] = [
  { nom: "sortie_poubelles", label: "Sortie des poubelles", aide: "Ex. bacs sortis mardi et vendredi soir ; tri le mercredi." },
  { nom: "local_poubelles", label: "Local / tri des poubelles", aide: "Emplacement, consignes de tri." },
  { nom: "gardien", label: "Gardien / concierge", aide: "Nom, téléphone, horaires, loge." },
  { nom: "travaux", label: "Travaux en cours (copropriété)", aide: "Nature, durée prévue, nuisances éventuelles." },
  { nom: "stationnement", label: "Stationnement / accès", aide: "Consignes d'accès — ne pas mettre de code sensible en clair." },
  { nom: "autres", label: "Autres consignes", aide: "Toute information utile au locataire." },
];

export function FormulaireInfosPratiques({
  orgId,
  bienId,
  infos,
}: {
  orgId: string;
  bienId: string;
  infos: InfosPratiques | null;
}) {
  const action = enregistrerInfosPratiques.bind(null, orgId, bienId);
  const [etat, formAction, enCours] = useActionState<EtatParc, FormData>(action, {});

  return (
    <div className="space-y-4">
      {/* Numéros d'urgence — toujours affichés, non éditables */}
      <div className="rounded-lg bg-muted p-3">
        <p className="mb-1.5 text-sm font-medium">Numéros d&apos;urgence</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {URGENCES.map(([num, libelle]) => (
            <li key={num}>
              <span className="font-semibold text-foreground">{num}</span> — {libelle}
            </li>
          ))}
        </ul>
      </div>

      <form action={formAction} className="space-y-3">
        {CHAMPS.map((c) => (
          <div key={c.nom} className="space-y-1.5">
            <Label htmlFor={`ip-${c.nom}`}>{c.label}</Label>
            <textarea
              id={`ip-${c.nom}`}
              name={c.nom}
              rows={2}
              defaultValue={infos?.[c.nom] ?? ""}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder={c.aide}
            />
          </div>
        ))}
        {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
        {etat.succes && (
          <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
        )}
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer les informations pratiques"}
        </Button>
      </form>
    </div>
  );
}
