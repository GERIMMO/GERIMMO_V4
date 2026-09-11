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
// `nombre` est nullable depuis le 11/09 : NULL = pas encore compté (ligne
// reprise de l'entrée), 0 = compté, aucune rendue. La distinction se voit à
// l'écran comme au document.
export type Cle = { id: string; libelle: string; nombre: number | null; reference: string | null };

// Ce que portait l'entrée signée, pour l'afficher EN REGARD de la sortie —
// RM-1.13.1 (« à la sortie, l'état d'entrée est affiché en regard »,
// wiki/concepts/État des lieux.md). Jamais pour pré-remplir : un index de
// sortie recopié de l'entrée serait un faux.
export type AnnexesEntree = {
  compteurs: { type: string; numero: string | null; releve: number | null }[];
  cles: { libelle: string; nombre: number | null; reference: string | null }[];
};

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

// Appariement entrée/sortie : type ET numéro, jamais le type seul. Un compteur
// remplacé en cours de bail porte un autre numéro — afficher l'index d'entrée
// d'un AUTRE compteur en face de lui serait une comparaison fausse. Sans
// correspondance exacte, aucun index d'entrée n'est montré.
const apparier = (a: string, b: string | null) => JSON.stringify([a, b ?? ""]);

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
  entree,
  enregistrer,
}: {
  orgId: string;
  bailId: string;
  edlId: string;
  compteurs: Compteur[];
  cles: Cle[];
  signe: boolean;
  // Renseigné seulement sur un EDL de SORTIE né d'une entrée signée.
  entree: AnnexesEntree | null;
  enregistrer: (etat: EtatEdl, formData: FormData) => Promise<EtatEdl>;
}) {
  const actionCompteur = ajouterCompteur.bind(null, orgId, bailId, edlId);
  const [etatC, formCompteur] = useActionState<EtatEdl, FormData>(actionCompteur, {});
  const actionCle = ajouterCle.bind(null, orgId, bailId, edlId);
  const [etatK, formCle] = useActionState<EtatEdl, FormData>(actionCle, {});
  const [etatA, formAnnexes] = useActionState<EtatEdl, FormData>(enregistrer, {});
  // Lignes de saisie compactes : un libellé visible casserait la rangée, les
  // libellés n'existent donc que pour la synthèse vocale. Identifiants tirés
  // de useId() — la page peut aligner plusieurs EDL.
  const idTypeCompteur = useId();
  const idTypeCle = useId();
  const idNombreCles = useId();
  // Les champs de saisie vivent DANS les listes, le bouton dans son propre
  // formulaire : les rattacher par `form=` évite d'imbriquer ce formulaire et
  // ceux des boutons « Retirer » (interdit en HTML), sans rien perdre de
  // l'erreur affichée sous chaque ligne.
  const idFormAnnexes = useId();

  const relevesEntree = new Map<string, number | null>();
  for (const c of entree?.compteurs ?? []) relevesEntree.set(apparier(c.type, c.numero), c.releve);
  const nombresEntree = new Map<string, number | null>();
  for (const k of entree?.cles ?? []) nombresEntree.set(apparier(k.libelle, k.reference), k.nombre);

  const aEnregistrer = !signe && (compteurs.length > 0 || cles.length > 0);

  return (
    <div className="space-y-6">
      {/* Compteurs */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Relevés de compteurs</p>
        {compteurs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {entree
              ? "L'état des lieux d'entrée ne portait aucun relevé de compteur : ajoutez ici les index de sortie."
              : "Aucun relevé de compteur. Notez les index à l'entrée : ils feront foi à la sortie."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {compteurs.map((c) => {
              const cle = apparier(c.type, c.numero);
              const aEntree = relevesEntree.has(cle);
              return (
                // Le gabarit est le téléphone, debout, logement en main : le
                // compteur occupe sa propre ligne, l'index d'entrée et la
                // saisie de sortie se lisent côte à côte en dessous — deux
                // niveaux, jamais trois (relevé du 11/09).
                <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 basis-full truncate sm:flex-1 sm:basis-auto">
                    {c.type}
                    {c.numero && <span className="text-muted-foreground"> · n° {c.numero}</span>}
                  </span>
                  {aEntree && (
                    <span className="mono-discret shrink-0">
                      entrée {relevesEntree.get(cle) ?? "—"}
                    </span>
                  )}
                  {signe ? (
                    <span className="shrink-0 font-medium">{c.releve ?? "—"}</span>
                  ) : (
                    <Input
                      form={idFormAnnexes}
                      name={`releve_${c.id}`}
                      type="number"
                      step="0.001"
                      defaultValue={c.releve ?? ""}
                      aria-label={`Relevé de ${c.type}${c.numero ? ` n° ${c.numero}` : ""}`}
                      className="h-9 w-28 shrink-0"
                    />
                  )}
                  {!signe && (
                    <BoutonRetirer onAction={() => supprimerCompteur(orgId, bailId, edlId, c.id)} />
                  )}
                </li>
              );
            })}
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
        <p className="text-sm font-medium">
          {entree ? "Clés / badges rendus" : "Clés / badges remis"}
        </p>
        {cles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {entree
              ? "L'état des lieux d'entrée ne recensait aucune clé : ajoutez ici ce qui est rendu."
              : "Aucune clé enregistrée. Comptez les clés et badges remis : ils devront être rendus à la sortie."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {cles.map((k) => {
              const cle = apparier(k.libelle, k.reference);
              const aEntree = nombresEntree.has(cle);
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 basis-full truncate sm:flex-1 sm:basis-auto">
                    {signe && (k.nombre === null ? "— " : `${k.nombre}× `)}
                    {k.libelle}
                    {k.reference && <span className="text-muted-foreground"> · {k.reference}</span>}
                  </span>
                  {aEntree && (
                    <span className="mono-discret shrink-0">
                      {nombresEntree.get(cle)} remis à l&apos;entrée
                    </span>
                  )}
                  {!signe && (
                    <Input
                      form={idFormAnnexes}
                      name={`nombre_${k.id}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={k.nombre ?? ""}
                      placeholder="—"
                      aria-label={`${entree ? "Nombre rendu" : "Nombre remis"} — ${k.libelle}${k.reference ? ` (${k.reference})` : ""}`}
                      className="h-9 w-20 shrink-0"
                    />
                  )}
                  {!signe && (
                    <BoutonRetirer onAction={() => supprimerCle(orgId, bailId, edlId, k.id)} />
                  )}
                </li>
              );
            })}
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

      {/* Un seul envoi pour toutes les annexes : la structure est déjà là
          (reprise de l'entrée), il ne reste que les chiffres constatés sur
          place — les faire partir un par un coûtait huit envois. */}
      {aEnregistrer && (
        <form
          id={idFormAnnexes}
          action={formAnnexes}
          className="flex flex-wrap items-center gap-2 border-t border-border pt-4"
        >
          <BoutonEnvoi enCoursTexte="Enregistrement…" size="sm" variant="outline">
            {entree ? "Enregistrer les relevés et les clés rendues" : "Enregistrer les relevés"}
          </BoutonEnvoi>
          <span className="text-xs text-muted-foreground">
            Les index et les nombres saisis ci-dessus partent ensemble. Le type, le
            numéro et la référence se corrigent en retirant la ligne.
          </span>
          {etatA.erreur && <span className="w-full text-sm text-destructive">{etatA.erreur}</span>}
          {etatA.succes && (
            <span className="w-full text-sm text-success-soft-foreground">{etatA.succes}</span>
          )}
        </form>
      )}
    </div>
  );
}
