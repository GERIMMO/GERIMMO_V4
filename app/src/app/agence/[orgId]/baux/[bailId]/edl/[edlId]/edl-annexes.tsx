"use client";

import { useActionState, useId } from "react";
import {
  ajouterCompteur,
  supprimerCompteur,
  ajouterCle,
  supprimerCle,
  type EtatEdl,
} from "@/app/actions/edl";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

// L'erreur de l'action (« EDL signé : figé »…) s'affiche sous la ligne —
// avant, elle était jetée (audit vie du bail 09/09).
function BoutonRetirer({ onAction }: { onAction: () => Promise<EtatEdl> }) {
  const [etat, formAction] = useActionState<EtatEdl, FormData>(() => onAction(), {});
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
  const [etatC, formCompteur] = useActionState<EtatEdl, FormData>(actionCompteur, {});
  const actionCle = ajouterCle.bind(null, orgId, bailId, edlId);
  const [etatK, formCle] = useActionState<EtatEdl, FormData>(actionCle, {});
  // Lignes de saisie compactes : un libellé visible casserait la rangée, les
  // libellés n'existent donc que pour la synthèse vocale. Identifiants tirés
  // de useId() — la page peut aligner plusieurs EDL.
  const idTypeCompteur = useId();
  const idTypeCle = useId();
  const idNombreCles = useId();

  return (
    <div className="space-y-6">
      {/* Compteurs */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Relevés de compteurs</p>
        {compteurs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun relevé de compteur. Notez les index à l&apos;entrée : ils feront foi à la sortie.</p>
        ) : (
          <ul className="divide-y divide-border">
            {compteurs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {c.type}
                  {c.numero && <span className="text-muted-foreground"> · n° {c.numero}</span>}
                </span>
                <span className="shrink-0 font-medium">{c.releve ?? "—"}</span>
                {!signe && (
                  <BoutonRetirer onAction={() => supprimerCompteur(orgId, bailId, edlId, c.id)} />
                )}
              </li>
            ))}
          </ul>
        )}
        {!signe && (
          <form action={formCompteur} className="flex flex-wrap items-end gap-2">
            {/* En erreur, la saisie est reposée via etatC.valeurs (recette 22/08) */}
            <Label htmlFor={idTypeCompteur} className="sr-only">
              Type de compteur
            </Label>
            <select
              id={idTypeCompteur}
              name="type"
              defaultValue={etatC.valeurs?.type ?? ""}
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
            <Input name="numero" aria-label="Numéro du compteur" placeholder="N° compteur" defaultValue={etatC.valeurs?.numero} className="h-9 w-36" />
            <Input name="releve" aria-label="Relevé du compteur" type="number" step="0.001" placeholder="Relevé" defaultValue={etatC.valeurs?.releve} className="h-9 w-28" />
            <BoutonEnvoi enCoursTexte="Ajout…" size="sm" variant="outline">
              Ajouter
            </BoutonEnvoi>
            {etatC.erreur && <p className="w-full text-sm text-destructive">{etatC.erreur}</p>}
          </form>
        )}
      </div>

      {/* Clés */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Clés / badges remis</p>
        {cles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune clé enregistrée. Comptez les clés et badges remis : ils devront être rendus à la sortie.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cles.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {k.nombre}× {k.libelle}
                  {k.reference && <span className="text-muted-foreground"> · {k.reference}</span>}
                </span>
                {!signe && (
                  <BoutonRetirer onAction={() => supprimerCle(orgId, bailId, edlId, k.id)} />
                )}
              </li>
            ))}
          </ul>
        )}
        {!signe && (
          <form action={formCle} className="flex flex-wrap items-end gap-2">
            {/* En erreur, la saisie est reposée via etatK.valeurs (recette 22/08) */}
            <Label htmlFor={idTypeCle} className="sr-only">
              Type de clé ou de badge
            </Label>
            <select
              id={idTypeCle}
              name="libelle"
              defaultValue={etatK.valeurs?.libelle ?? ""}
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
            <Label htmlFor={idNombreCles} className="sr-only">
              Nombre de clés ou badges remis
            </Label>
            <Input id={idNombreCles} name="nombre" type="number" min="0" defaultValue={etatK.valeurs?.nombre ?? 1} className="h-9 w-20" />
            <Input name="reference" aria-label="Référence de la clé" placeholder="Référence" defaultValue={etatK.valeurs?.reference} className="h-9 w-36" />
            <BoutonEnvoi enCoursTexte="Ajout…" size="sm" variant="outline">
              Ajouter
            </BoutonEnvoi>
            {etatK.erreur && <p className="w-full text-sm text-destructive">{etatK.erreur}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
