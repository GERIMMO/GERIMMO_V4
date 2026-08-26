"use client";

import { useActionState, useState } from "react";
import { rattacherDocument, type EtatDocumentGed } from "@/app/actions/documents-ged";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { afficherToast } from "@/components/ui/toast";

export type FichesRattachables = {
  personnes: { id: string; libelle: string }[];
  lots: { id: string; libelle: string }[];
  baux: { id: string; libelle: string }[];
};

const LIBELLES_ENTITE: Record<keyof FichesRattachables, string> = {
  personnes: "Personne",
  lots: "Lot",
  baux: "Bail",
};

const ENTITE_SQL: Record<keyof FichesRattachables, string> = {
  personnes: "personne",
  lots: "lot",
  baux: "bail",
};

// « Rattacher à une autre fiche » (maquette pageDocument) : la pièce est
// stockée une fois et apparaît sur chacune de ses fiches.
export function FormulaireRattacher({
  orgId,
  documentId,
  fiches,
}: {
  orgId: string;
  documentId: string;
  fiches: FichesRattachables;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [famille, setFamille] = useState<keyof FichesRattachables>("personnes");
  const actionLiee = rattacherDocument.bind(null, orgId, documentId);
  // Toast à la résolution de l'action (convention 24/08), jamais dans un effet
  const [etat, action, enCours] = useActionState<EtatDocumentGed, FormData>(
    async (precedent, formData) => {
      const res = await actionLiee(precedent, formData);
      if (res.succes) {
        afficherToast(res.succes);
        setOuvert(false);
      }
      return res;
    },
    {}
  );

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        Rattacher à une autre fiche
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-md border border-border p-3">
      <input type="hidden" name="entite" value={ENTITE_SQL[famille]} />
      <div className="space-y-2">
        <Label htmlFor="famille-rattachement">Type de fiche</Label>
        <select
          id="famille-rattachement"
          value={famille}
          onChange={(e) => setFamille(e.target.value as keyof FichesRattachables)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {(Object.keys(LIBELLES_ENTITE) as (keyof FichesRattachables)[]).map((f) => (
            <option key={f} value={f}>
              {LIBELLES_ENTITE[f]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fiche-rattachement">Fiche</Label>
        {/* La saisie est reposée en erreur via etat.valeurs (recette 22/08) */}
        <select
          id="fiche-rattachement"
          name="entite_id"
          required
          defaultValue={etat.valeurs?.entite_id ?? ""}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">— Choisir —</option>
          {fiches[famille].map((f) => (
            <option key={f.id} value={f.id}>
              {f.libelle}
            </option>
          ))}
        </select>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? "Rattachement…" : "Rattacher"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Fermer
        </Button>
      </div>
    </form>
  );
}
