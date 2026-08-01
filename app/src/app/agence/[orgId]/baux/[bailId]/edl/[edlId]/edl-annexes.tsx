"use client";

import { useActionState } from "react";
import {
  ajouterCompteur,
  supprimerCompteur,
  ajouterCle,
  supprimerCle,
  type EtatEdl,
} from "@/app/actions/edl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Compteur = {
  id: string;
  type: string;
  numero: string | null;
  releve: number | null;
};
export type Cle = { id: string; libelle: string; nombre: number; reference: string | null };

const TYPES_COMPTEUR = [
  "Eau froide",
  "Eau chaude",
  "Gaz",
  "Électricité (HP)",
  "Électricité (HC)",
];
const TYPES_CLE = [
  "Porte d'entrée",
  "Boîte aux lettres",
  "Cave",
  "Parking",
  "Badge / immeuble",
  "Autre",
];

function BoutonRetirer({ onAction }: { onAction: () => Promise<void> }) {
  return (
    <form action={onAction}>
      <Button type="submit" variant="ghost" size="sm">
        ✕
      </Button>
    </form>
  );
}

export function EdlAnnexes({
  orgId,
  bailId,
  edlId,
  compteurs,
  cles,
  signe,
}: {
  orgId: string;
  bailId: string;
  edlId: string;
  compteurs: Compteur[];
  cles: Cle[];
  signe: boolean;
}) {
  const actionCompteur = ajouterCompteur.bind(null, orgId, bailId, edlId);
  const [etatC, formCompteur, enCoursC] = useActionState<EtatEdl, FormData>(actionCompteur, {});
  const actionCle = ajouterCle.bind(null, orgId, bailId, edlId);
  const [etatK, formCle, enCoursK] = useActionState<EtatEdl, FormData>(actionCle, {});

  return (
    <div className="space-y-6">
      {/* Compteurs */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Relevés de compteurs</p>
        {compteurs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun relevé.</p>
        ) : (
          <ul className="divide-y divide-border">
            {compteurs.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {c.type}
                  {c.numero && <span className="text-muted-foreground"> · n° {c.numero}</span>}
                </span>
                <span className="shrink-0 font-medium">{c.releve ?? "—"}</span>
                {!signe && (
                  <BoutonRetirer onAction={async () => { await supprimerCompteur(orgId, bailId, edlId, c.id); }} />
                )}
              </li>
            ))}
          </ul>
        )}
        {!signe && (
          <form action={formCompteur} className="flex flex-wrap items-end gap-2">
            <select
              name="type"
              defaultValue=""
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="" disabled>
                Type…
              </option>
              {TYPES_COMPTEUR.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input name="numero" placeholder="N° compteur" className="h-9 w-36" />
            <Input name="releve" type="number" step="0.001" placeholder="Relevé" className="h-9 w-28" />
            <Button type="submit" size="sm" variant="outline" disabled={enCoursC}>
              {enCoursC ? "Ajout…" : "Ajouter"}
            </Button>
            {etatC.erreur && <p className="w-full text-sm text-destructive">{etatC.erreur}</p>}
          </form>
        )}
      </div>

      {/* Clés */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Clés / badges remis</p>
        {cles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune clé enregistrée.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cles.map((k) => (
              <li key={k.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {k.nombre}× {k.libelle}
                  {k.reference && <span className="text-muted-foreground"> · {k.reference}</span>}
                </span>
                {!signe && (
                  <BoutonRetirer onAction={async () => { await supprimerCle(orgId, bailId, edlId, k.id); }} />
                )}
              </li>
            ))}
          </ul>
        )}
        {!signe && (
          <form action={formCle} className="flex flex-wrap items-end gap-2">
            <select
              name="libelle"
              defaultValue=""
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="" disabled>
                Type de clé…
              </option>
              {TYPES_CLE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input name="nombre" type="number" min="0" defaultValue={1} className="h-9 w-20" />
            <Input name="reference" placeholder="Référence" className="h-9 w-36" />
            <Button type="submit" size="sm" variant="outline" disabled={enCoursK}>
              {enCoursK ? "Ajout…" : "Ajouter"}
            </Button>
            {etatK.erreur && <p className="w-full text-sm text-destructive">{etatK.erreur}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
