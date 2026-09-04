"use client";

import { useActionState, useRef, useState } from "react";
import { majGrilleEdl, type EtatEdl } from "@/app/actions/edl";
import { formaterDate } from "@/lib/ged";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modale } from "@/components/ui/modale";

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

// Du meilleur au pire : un état de sortie plus haut dans ce rang que l'état
// d'entrée signale un élément dégradé pendant le bail.
const RANG_ETAT: Record<string, number> = { neuf: 0, bon: 1, usage: 2, mauvais: 3, absent: 4 };

type Ligne = {
  id: string;
  categorie: string;
  piece: string | null;
  libelle: string;
  etat: string | null;
  commentaire: string | null;
};

type LigneReference = {
  piece: string | null;
  categorie: string;
  libelle: string;
  etat: string | null;
  commentaire: string | null;
};

export type ReferenceEntree = { date: string | null; lignes: LigneReference[] };

// Même clé d'appariement que le RPC comparatif_edl : pièce + catégorie + libellé.
const cleLigne = (l: { piece: string | null; categorie: string | null; libelle: string }) =>
  `${l.piece ?? ""}|${l.categorie ?? ""}|${l.libelle}`;

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
  reference,
}: {
  orgId: string;
  bailId: string;
  edlId: string;
  lignes: Ligne[];
  signe: boolean;
  // EDL d'entrée signé du même bail (saisie de sortie uniquement) : chaque
  // ligne rappelle l'état et l'observation d'entrée (maquette v3).
  reference?: ReferenceEntree | null;
}) {
  const actionMaj = majGrilleEdl.bind(null, orgId, bailId, edlId);
  const [etatMaj, formMaj, enCoursMaj] = useActionState<EtatEdl, FormData>(actionMaj, {});
  // La grille est pilotée (recette 21/08) : c'est ce qui permet de remplir une
  // section d'un coup, de surligner les lignes sans état, et de savoir avant
  // de signer combien il en manque.
  const [etats, setEtats] = useState<Record<string, string>>(() =>
    Object.fromEntries(lignes.map((l) => [l.id, l.etat ?? ""]))
  );
  // Commentaires contrôlés eux aussi (recette 22/08) : React réinitialise les
  // champs libres d'un formulaire après son action — la grille semblait se
  // vider à chaque « Enregistrer » alors que la base était bien à jour.
  const [commentaires, setCommentaires] = useState<Record<string, string>>(() =>
    Object.fromEntries(lignes.map((l) => [l.id, l.commentaire ?? ""]))
  );
  const [confirmeSignature, setConfirmeSignature] = useState(false);
  const boutonSigner = useRef<HTMLButtonElement>(null);
  const manquantes = lignes.filter((l) => !etats[l.id]).length;

  const refParCle = new Map<string, LigneReference>(
    (reference?.lignes ?? []).map((l) => [cleLigne(l), l])
  );
  const referenceDe = (l: Ligne) => refParCle.get(cleLigne(l)) ?? null;
  const estDegrade = (l: Ligne) => {
    const r = referenceDe(l);
    const etat = etats[l.id];
    return Boolean(
      r?.etat && etat && (RANG_ETAT[etat] ?? 0) > (RANG_ETAT[r.etat] ?? 0)
    );
  };
  const degradees = reference ? lignes.filter(estDegrade).length : 0;

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

  // Reprendre tel quel l'état et l'observation d'entrée sur une ligne
  const reprendreEntree = (l: Ligne) => {
    const r = referenceDe(l);
    if (!r?.etat) return;
    setEtats((prev) => ({ ...prev, [l.id]: r.etat! }));
    setCommentaires((prev) => ({ ...prev, [l.id]: r.commentaire ?? "" }));
  };

  return (
    <div className="space-y-4">
      {reference && (
        <p className="text-sm text-muted-foreground">
          Comparé à l&apos;entrée
          {reference.date ? ` du ${formaterDate(reference.date)}` : ""} : pour chaque
          élément, l&apos;état d&apos;entrée est rappelé avec son observation — la sortie
          se juge par rapport à lui.
        </p>
      )}
      <form action={formMaj} className="space-y-3">
        {grouper(lignes).map((g) => {
          const reprenables = reference
            ? g.lignes.filter((l) => referenceDe(l)?.etat)
            : [];
          return (
          <div key={g.titre} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="mono-discret">{g.titre}</p>
              <span className="flex items-center gap-3">
                {/* Maquette v3 : toute la section conforme à l'entrée d'un geste */}
                {reprenables.length > 0 && (
                  <button
                    type="button"
                    className="lien-discret"
                    onClick={() => {
                      for (const l of reprenables) reprendreEntree(l);
                    }}
                  >
                    Toute la section : conforme à l&apos;entrée
                  </button>
                )}
                {/* Toute la section d'un coup, puis on ajuste ligne à ligne */}
                <select
                  value=""
                  aria-label={`Appliquer un état à toute la section ${g.titre}`}
                  onChange={(e) => {
                    const valeur = e.target.value;
                    if (!valeur) return;
                    setEtats((prev) => {
                      const suivant = { ...prev };
                      for (const l of g.lignes) suivant[l.id] = valeur;
                      return suivant;
                    });
                  }}
                  className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs text-muted-foreground"
                >
                  <option value="">Toute la section…</option>
                  {Object.entries(ETATS_ELEMENT).map(([v, lib]) => (
                    <option key={v} value={v}>
                      {lib}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            {g.lignes.map((l) => {
              const r = reference ? referenceDe(l) : null;
              return (
                <div
                  key={l.id}
                  className={`space-y-1.5 border-b border-border py-2 ${
                    etats[l.id] ? "" : "border-l-2 border-l-destructive pl-2"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{l.libelle}</span>
                    {estDegrade(l) && (
                      <span className="puce puce-rouge">Dégradé depuis l&apos;entrée</span>
                    )}
                  </div>
                  {reference && (
                    <div className="edl-rappel">
                      {r?.etat ? (
                        <>
                          <span className={COULEURS_ETAT_ELEMENT[r.etat] ?? "puce puce-grise"}>
                            {ETATS_ELEMENT[r.etat] ?? r.etat}
                          </span>{" "}
                          <span className={r.commentaire ? "" : "italic"}>
                            {r.commentaire || "Aucune observation à l'entrée"}
                          </span>
                        </>
                      ) : (
                        <span className="italic">
                          Élément absent de l&apos;entrée (grille modifiée) — non comparable.
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      name={`etat_${l.id}`}
                      value={etats[l.id] ?? ""}
                      onChange={(e) =>
                        setEtats((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
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
                      value={commentaires[l.id] ?? ""}
                      onChange={(e) =>
                        setCommentaires((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
                      placeholder={reference ? "observation de sortie" : "commentaire"}
                      className="h-8 min-w-40 flex-1 text-sm"
                    />
                    {r?.etat && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        title="Reprendre l'état et l'observation d'entrée"
                        onClick={() => reprendreEntree(l)}
                      >
                        = Entrée
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {/* Compteur d'avancement (maquette v3) : où on en est avant de signer */}
          <span className="barre" style={{ width: 120, height: 7 }}>
            <i
              style={{
                width: `${lignes.length ? Math.round(((lignes.length - manquantes) / lignes.length) * 100) : 0}%`,
                background: manquantes === 0 ? "var(--success)" : "var(--or)",
              }}
            />
          </span>
          <span className="mono-discret">
            {lignes.length - manquantes}/{lignes.length} renseignée
            {lignes.length - manquantes > 1 ? "s" : ""}
            {degradees > 0
              ? ` · ${degradees} dégradé${degradees > 1 ? "s" : ""}`
              : ""}
          </span>
          <Button type="submit" size="sm" variant="outline" disabled={enCoursMaj}>
            {enCoursMaj ? "Enregistrement…" : "Enregistrer la grille"}
          </Button>
          {/* Un seul geste : la signature enregistre la grille puis la fige.
              En sortie comparée, une confirmation annonce d'abord ce que les
              écarts déclencheront (maquette v3). */}
          {reference ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={enCoursMaj || manquantes > 0}
                onClick={() => setConfirmeSignature(true)}
              >
                Enregistrer et signer
              </Button>
              <button type="submit" name="signer" value="1" ref={boutonSigner} hidden />
            </>
          ) : (
            <Button
              type="submit"
              name="signer"
              value="1"
              size="sm"
              disabled={enCoursMaj || manquantes > 0}
            >
              {enCoursMaj ? "…" : "Enregistrer et signer"}
            </Button>
          )}
          {manquantes > 0 && (
            <span className="text-sm text-warning-soft-foreground">
              {manquantes} ligne{manquantes > 1 ? "s" : ""} sans état (en rouge) —
              la signature attendra.
            </span>
          )}
          {etatMaj.succes && (
            <span className="text-sm text-success-soft-foreground">{etatMaj.succes}</span>
          )}
          {etatMaj.erreur && <span className="text-sm text-destructive">{etatMaj.erreur}</span>}
        </div>
        {confirmeSignature && (
          <Modale
            titre="Signer l'état des lieux de sortie"
            surtitre="Sortie de bail"
            fermer={() => setConfirmeSignature(false)}
            pied={
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmeSignature(false)}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmeSignature(false);
                    boutonSigner.current?.click();
                  }}
                >
                  Signer
                </Button>
              </div>
            }
          >
            <p className="text-sm">
              {degradees > 0
                ? `${degradees} élément${degradees > 1 ? "s" : ""} dégradé${degradees > 1 ? "s" : ""} par rapport à l'entrée : ils alimenteront le décompte de restitution du dépôt de garantie — retenues à justifier, vétusté déduite.`
                : "Aucun élément dégradé par rapport à l'entrée : sauf sommes restant dues, le dépôt de garantie devra être restitué en totalité."}{" "}
              La signature des deux parties clôt la saisie et fige la grille.
            </p>
          </Modale>
        )}
      </form>
    </div>
  );
}
