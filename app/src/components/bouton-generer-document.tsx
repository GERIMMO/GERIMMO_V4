"use client";

import { useState, useTransition } from "react";
import { genererDocument, type EtatGeneration } from "@/app/actions/documents-generes";
import type { CodeModele } from "@/lib/documents/modeles";
import { afficherToast } from "@/components/ui/toast";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";

// Bouton commun du sprint « Documents-0 » : génère le PDF, toast à la
// résolution (convention 23/08), puis propose d'ouvrir le document et dit
// quels champs sont restés en libellé — la même liste part en recette.
export function BoutonGenererDocument({
  orgId,
  code,
  cibleId,
  cheminRetour,
  libelle,
  variant = "outline",
  size = "sm",
}: {
  orgId: string;
  code: CodeModele;
  cibleId: string;
  cheminRetour: string;
  libelle: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
}) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<EtatGeneration | null>(null);

  function generer() {
    demarrer(async () => {
      const res = await genererDocument(orgId, code, cibleId, cheminRetour);
      setResultat(res);
      if (res.succes) afficherToast(res.succes);
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size={size} variant={variant} disabled={enCours} onClick={generer}>
        {enCours ? "Génération…" : libelle}
      </Button>
      {resultat?.documentId && (
        <a
          href={`/agence/${orgId}/documents/${resultat.documentId}/fichier`}
          target="_blank"
          rel="noreferrer"
          className="lien-discret text-xs"
        >
          Ouvrir le PDF
        </a>
      )}
      {resultat?.erreur && <span className="text-xs text-destructive">{resultat.erreur}</span>}
      {resultat && !resultat.erreur && (resultat.manquants?.length ?? 0) > 0 && (
        <span className="block w-full text-xs text-warning-soft-foreground">
          Restés en libellé :{" "}
          {resultat.manquants!.slice(0, 5).map((m, i) => {
            const cible = lienPourManquant(m, orgId, resultat.liens ?? [], code);
            return (
              <span key={m}>
                {i > 0 && " · "}
                {m}
                {cible && (
                  <>
                    {" "}
                    <Link href={cible.href} className="lien-discret">
                      renseigner ({cible.ecran}) →
                    </Link>
                  </>
                )}
              </span>
            );
          })}
          {resultat.manquants!.length > 5 ? ` · +${resultat.manquants!.length - 5}` : ""}
        </span>
      )}
    </span>
  );
}
