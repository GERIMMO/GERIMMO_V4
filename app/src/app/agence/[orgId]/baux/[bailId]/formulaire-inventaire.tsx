"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useActionStateSuivi } from "@/lib/suivi-enregistrement";


import {
  ajouterInventaireLigne,
  ajouterMobilierDecret,
  modifierInventaireLigne,
  supprimerInventaireLigne,
  type EtatBail,
} from "@/app/actions/baux";
import { ETATS_INVENTAIRE as ETATS, LIBELLE_ETAT_INVENTAIRE as LIBELLE_ETAT, MOBILIER_DECRET_2015_981 } from "@/lib/inventaire-meuble";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelBail as Label, PastilleBail } from "@/components/pastille-bail";

export type LigneInventaire = {
  id: string;
  piece: string | null;
  designation: string;
  quantite: number;
  etat: string | null;
  observation: string | null;
};

function BoutonSupprimer({ orgId, bailId, ligneId }: { orgId: string; bailId: string; ligneId: string }) {
  const [etat, action] = useActionStateSuivi<EtatBail, FormData>(
    () => supprimerInventaireLigne(orgId, bailId, ligneId), {}
  );
  return (
    <div>
      <form data-saisie-confirmee action={action}><BoutonEnvoi variant="ghost" size="sm">Retirer</BoutonEnvoi></form>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    </div>
  );
}

// Décision du 27/10 (CB-14) : une ligne créée par l'ajout groupé naît sans état ;
// elle se complète (quantité, état) sur place, sans la retirer puis la ressaisir.
function LigneMobilier({ orgId, bailId, ligne: l }: { orgId: string; bailId: string; ligne: LigneInventaire }) {
  const [etat, formAction] = useActionStateSuivi<EtatBail, FormData>(
    modifierInventaireLigne.bind(null, orgId, bailId, l.id), {}
  );
  // Ouvert sur un état donné : un enregistrement réussi renvoie un nouvel état et
  // referme la ligne (la page rafraîchie montre ses valeurs) ; une erreur la laisse ouverte.
  const [ouvertSur, setOuvertSur] = useState<EtatBail | null>(null);
  const edition = ouvertSur !== null && (ouvertSur === etat || !etat.succes);
  const setEdition = (ouvrir: boolean) => setOuvertSur(ouvrir ? etat : null);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
      {/* Au téléphone, la désignation prend sa ligne : trois gestes à côté la réduisaient à rien. */}
      <span className="basis-full truncate sm:min-w-0 sm:flex-1 sm:basis-0">
        {l.quantite > 1 && <span className="text-muted-foreground">{l.quantite}× </span>}
        {l.designation}
        {l.piece && <span className="text-muted-foreground"> — {l.piece}</span>}
        {l.observation && <span className="text-muted-foreground"> ({l.observation})</span>}
      </span>
      {l.etat ? (
        <span className="puce puce-grise shrink-0">{LIBELLE_ETAT[l.etat] ?? "État à vérifier"}</span>
      ) : (
        <span className="puce puce-prep shrink-0">État à préciser</span>
      )}
      <Button type="button" variant="ghost" size="sm" aria-expanded={edition} onClick={() => setEdition(!edition)} aria-label={`${l.etat ? "Modifier" : "Compléter"} ${l.designation}`}>
        <Pencil size={14} aria-hidden="true" />{l.etat ? "Modifier" : "Compléter"}
      </Button>
      <BoutonSupprimer orgId={orgId} bailId={bailId} ligneId={l.id} />
      {edition && (
        <form data-saisie-confirmee action={formAction} className="flex basis-full flex-wrap items-end gap-2 pb-1" aria-label={`Compléter ${l.designation}`}>
          <div className="space-y-1.5">
            <Label htmlFor={`inv-${l.id}-quantite`} className="text-sm">Quantité</Label>
            <Input id={`inv-${l.id}-quantite`} name="quantite" type="number" min={1} className="w-20" defaultValue={etat.valeurs?.quantite ?? l.quantite} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`inv-${l.id}-etat`} className="text-sm">État</Label>
            <select
              id={`inv-${l.id}-etat`}
              name="etat"
              defaultValue={etat.valeurs?.etat ?? l.etat ?? ""}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">À préciser</option>
              {ETATS.map((e) => (
                <option key={e} value={e}>
                  {LIBELLE_ETAT[e]}
                </option>
              ))}
            </select>
          </div>
          <BoutonEnvoi enCoursTexte="Enregistrement…" size="sm" variant="outline">Enregistrer</BoutonEnvoi>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(false)}>Annuler</Button>
          {etat.erreur && <p role="alert" className="basis-full text-sm text-destructive">{etat.erreur}</p>}
        </form>
      )}
    </li>
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
  const [etat, formAction] = useActionStateSuivi<EtatBail, FormData>(action, {});
  const [etatDecret, actionDecret] = useActionStateSuivi<EtatBail, FormData>(
    ajouterMobilierDecret.bind(null, orgId, bailId), {}
  );

  return (
    <div className="space-y-4">
      <div className="bg-muted p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">
          Mobilier minimum obligatoire (décret 2015-981)
        </p>
        <p>{MOBILIER_DECRET_2015_981.join(" · ")}</p>
        <p className="mt-1">Un meublé incomplet expose à une requalification en bail nu.</p>
        {/* Décision du 27/10 (CB-14) : les onze lignes en un geste, un exemplaire chacune, état à préciser ;
            les éléments déjà inventoriés sont sautés (aucun doublon au second clic). Bouton seul : saisie libre. */}
        <form data-saisie-libre action={actionDecret} className="mt-2 flex flex-wrap items-center gap-2">
          <BoutonEnvoi enCoursTexte="Ajout…" size="sm" variant="outline">
            Ajouter les {MOBILIER_DECRET_2015_981.length} éléments obligatoires
          </BoutonEnvoi>
          <span>Une ligne par élément, quantité et état à préciser ensuite.</span>
        </form>
        {etatDecret.erreur && <p role="alert" className="mt-2 text-sm text-destructive">{etatDecret.erreur}</p>}
        {etatDecret.succes && <p role="status" className="mt-2 text-sm text-success-soft-foreground">{etatDecret.succes}</p>}
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground"><PastilleBail champ="inventaire"/> Aucun meuble inventorié. L&apos;inventaire est une annexe obligatoire du bail meublé : ajoutez les meubles ci-dessous.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lignes.map((l) => <LigneMobilier key={l.id} orgId={orgId} bailId={bailId} ligne={l} />)}
        </ul>
      )}

      <form data-saisie-confirmee action={formAction} className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium">Ajouter un meuble</p>
        {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label champ="inventaire" htmlFor="inv-designation" className="text-sm">
              Désignation
            </Label>
            <Input id="inv-designation" name="designation" required maxLength={120} placeholder="Canapé, lit 140, table…" defaultValue={etat.valeurs?.designation} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-piece" className="text-sm">
              Pièce
            </Label>
            <Input id="inv-piece" name="piece" maxLength={60} placeholder="Séjour, chambre 1…" defaultValue={etat.valeurs?.piece} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-quantite" className="text-sm">
              Quantité
            </Label>
            <Input id="inv-quantite" name="quantite" type="number" min={1} defaultValue={etat.valeurs?.quantite ?? 1} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-etat" className="text-sm">
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
            <Label htmlFor="inv-obs" className="text-sm">
              Observation
            </Label>
            <Input id="inv-obs" name="observation" maxLength={200} placeholder="Rayure, tache… (facultatif)" defaultValue={etat.valeurs?.observation} />
          </div>
        </div>
        {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
        {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
        <BoutonEnvoi enCoursTexte="Ajout…" size="sm" variant="outline">
          Ajouter au mobilier
        </BoutonEnvoi>
      </form>
    </div>
  );
}
