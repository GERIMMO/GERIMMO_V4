"use client";

import { useId, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { rattacherDocument, type EtatDocumentGed } from "@/app/actions/documents-ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
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
  // La liste des baux s'arrête à un plafond : un sélecteur qui tait les baux
  // les plus anciens ferait croire qu'ils n'existent pas.
  bauxTronques = false,
  integre = false,
  onFermer,
}: {
  orgId: string;
  documentId: string;
  fiches: FichesRattachables;
  bauxTronques?: boolean;
  integre?: boolean;
  onFermer?: () => void;
}) {
  const identifiant = useId();
  const [ouvert, setOuvert] = useState(false);
  const [famille, setFamille] = useState<keyof FichesRattachables>("personnes");
  const [entiteId, setEntiteId] = useState("");
  function fermer() {
    if (integre) onFermer?.();
    else setOuvert(false);
  }
  const actionLiee = rattacherDocument.bind(null, orgId, documentId);
  // Toast à la résolution de l'action (convention 24/08), jamais dans un effet
  const [etat, action] = useActionState<EtatDocumentGed, FormData>(
    async (precedent, formData) => {
      const res = await actionLiee(precedent, formData);
      if (res.succes) {
        afficherToast(res.succes);
        if (!integre) setEntiteId("");
        fermer();
      }
      return res;
    },
    {}
  );

  if (!integre && !ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        Rattacher à une autre fiche
      </Button>
    );
  }

  return (
    <form data-saisie-confirmee action={action} className={integre ? "space-y-4" : "space-y-3 rounded-md border border-border p-3"}>
      <input type="hidden" name="entite" value={ENTITE_SQL[famille]} />
      <div className="space-y-2">
        <Label htmlFor={`${identifiant}-famille`}>Type de fiche</Label>
        <select
          id={`${identifiant}-famille`}
          value={famille}
          onChange={(e) => {
            setFamille(e.target.value as keyof FichesRattachables);
            setEntiteId("");
          }}
          className="min-h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {(Object.keys(LIBELLES_ENTITE) as (keyof FichesRattachables)[]).map((f) => (
            <option key={f} value={f}>
              {LIBELLES_ENTITE[f]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${identifiant}-fiche`}>Fiche</Label>
        {/* Le choix reste présent après une erreur et se vide au changement de famille. */}
        <select
          id={`${identifiant}-fiche`}
          name="entite_id"
          required
          value={entiteId}
          onChange={(e) => setEntiteId(e.target.value)}
          className="min-h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">— Choisir —</option>
          {fiches[famille].map((f) => (
            <option key={f.id} value={f.id}>
              {f.libelle}
            </option>
          ))}
        </select>
      </div>
      {famille === "baux" && bauxTronques && (
        <p className="text-sm text-muted-foreground">
          Les {fiches.baux.length} baux les plus récents. Un bail plus ancien se
          rattache depuis sa propre fiche.
        </p>
      )}
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <BoutonEnvoi size="sm" className={integre ? "min-h-11" : undefined} enCoursTexte="Enregistrement…">
          {integre ? "Lier le document" : "Rattacher"}
        </BoutonEnvoi>
        <Button type="button" variant="ghost" size="sm" className={integre ? "min-h-11" : undefined} onClick={fermer}>
          Fermer
        </Button>
      </div>
    </form>
  );
}
