"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { correspond, initiales, type RolePersonne } from "@/lib/roles-personnes";

export type PersonneListe = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  roles: RolePersonne[];
};

// La recherche filtre la liste déjà chargée : à l'échelle d'une agence (quelques
// centaines de fiches au plus), c'est instantané et sans aller-retour serveur.
// Rendu maquette (charte v2) : une seule colonne bordée, des rangs à avatar —
// pas un îlot Card par personne.
export function ListePersonnes({
  orgId,
  personnes,
}: {
  orgId: string;
  personnes: PersonneListe[];
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
        {visibles.length === 0 ? (
          <div className="vide">
            {personnes.length === 0 ? (
              <p>
                Aucune personne. Créez la première fiche à droite — propriétaire,
                locataire ou garant, la fiche est la même.
              </p>
            ) : (
              <>
                <p>Personne ne correspond à « {recherche} ».</p>
                <button
                  type="button"
                  onClick={() => setRecherche("")}
                  className="mt-2 text-[var(--bleu)] underline-offset-2 hover:underline"
                >
                  Réinitialiser la recherche
                </button>
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
