"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { correspond, type RolePersonne } from "@/lib/roles-personnes";

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

      {visibles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {personnes.length === 0
              ? "Aucune personne. Créez la première fiche à droite — propriétaire, locataire ou garant, la fiche est la même."
              : `Personne ne correspond à « ${recherche} ».`}
          </CardContent>
        </Card>
      ) : (
        visibles.map((p) => (
          <Link key={p.id} href={`/agence/${orgId}/personnes/${p.id}`} className="block">
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.nom}
                    {p.prenom ? ` ${p.prenom}` : ""}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[p.email, p.telephone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {/* Charte §04 : le rôle en texte coloré, sans pastille. Une fiche
                    sans rôle n'affiche rien — c'est déjà une information. */}
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  {p.roles.map((r) => (
                    <span key={r.libelle} className={`badge-statut ${r.classe}`}>
                      {r.libelle}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
