"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { EchecLecture } from "../documents/echec-lecture";
import { correspond, initiales, type RolePersonne } from "@/lib/roles-personnes";

export type PersonneListe = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  roles: RolePersonne[];
  // Messages du locataire pas encore lus par un gestionnaire (chantier D1)
  messagesNonLus?: number;
};

// La recherche filtre la liste déjà chargée : à l'échelle d'une agence (quelques
// centaines de fiches au plus), c'est instantané et sans aller-retour serveur.
// Rendu maquette (charte v2) : une seule colonne bordée, des rangs à avatar —
// pas un îlot Card par personne.
export function ListePersonnes({
  orgId,
  personnes,
  // La lecture des fiches a échoué : ni liste ni état vide — proposer « créez
  // la première fiche » à une agence qui en a trois cents serait un mensonge.
  listeIllisible = false,
}: {
  orgId: string;
  personnes: PersonneListe[];
  listeIllisible?: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const visibles = personnes.filter((p) =>
    correspond(
      recherche,
      p.nom,
      p.prenom,
      p.email,
      // Chercher « garant » ou « propriétaire » liste les fiches de ce rôle.
      ...p.roles.map((r) => r.libelle)
    )
  );

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Chercher un nom, un email, un rôle…"
        aria-label="Chercher une personne"
      />

      <div className="colonne-liste">
        <div className="tete-liste">
          <span className="mono-discret">
            {recherche ? "Fiches filtrées" : "Toutes les fiches"}
          </span>
          <span className="mono-discret">
            {listeIllisible
              ? "—"
              : visibles.length === personnes.length
                ? `${personnes.length}`
                : `${visibles.length} / ${personnes.length}`}
          </span>
        </div>
        {listeIllisible ? (
          /* L'échec se dit LÀ où la liste aurait été : un cadre vide sous une
             tête de colonne se lit comme une agence sans personne. */
          <div className="p-3.5">
            <EchecLecture quoi={["les fiches de l'agence"]} />
          </div>
        ) : visibles.length === 0 ? (
          <div className="vide-guide">
            {personnes.length === 0 ? (
              <>
                <p className="titre">Aucune personne</p>
                <p className="explication">
                  Propriétaire, locataire ou garant : la fiche est la même, et
                  le rôle se déduit tout seul des baux, mandats et détentions.
                </p>
                <span className="geste">
                  <a href="#creer-fiche" className="btn-or">
                    + Créer une fiche
                  </a>
                </span>
              </>
            ) : (
              <>
                <p className="titre">Personne ne correspond</p>
                <p className="explication">
                  Aucune des {personnes.length} fiches ne répond à «{" "}
                  {recherche} ». La recherche accepte aussi un rôle —
                  « garant », « propriétaire ».
                </p>
                <span className="geste">
                  <button
                    type="button"
                    onClick={() => setRecherche("")}
                    className="lien-discret"
                  >
                    Réinitialiser la recherche
                  </button>
                </span>
              </>
            )}
          </div>
        ) : (
          visibles.map((p) => (
            <Link
              key={p.id}
              href={`/agence/${orgId}/personnes/${p.id}`}
              className="rang"
            >
              <span aria-hidden className="avatar">
                {initiales(p.nom, p.prenom)}
              </span>
              {(p.messagesNonLus ?? 0) > 0 && (
                /* « non lu(s) » partout : la liste des personnes disait
                   « messages », l'écran Messages disait « nouveaux » — même
                   compteur, trois mots (relevé du 11/09). */
                <span className="puce puce-encre shrink-0">
                  {p.messagesNonLus} non lu{(p.messagesNonLus ?? 0) > 1 ? "s" : ""}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <b className="block truncate">
                  {p.nom}
                  {p.prenom ? ` ${p.prenom}` : ""}
                </b>
                <small className="block truncate">
                  {[p.email, p.telephone].filter(Boolean).join(" · ") || "—"}
                </small>
              </span>
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {p.roles.map((r) => (
                  <span key={r.libelle} className={`puce ${r.puce}`}>
                    {r.libelle}
                  </span>
                ))}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
