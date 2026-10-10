"use client";

import { useContext, useState, useTransition } from "react";
import { genererDocument, type EtatGeneration } from "@/app/actions/documents-generes";
import type { CodeModele } from "@/lib/documents/modeles";
import { afficherToast } from "@/components/ui/toast";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { actualiserControleGeneration } from "@/lib/documents/controle-generation";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
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
  // Les choix du geste (motif d'un congé, garant d'un cautionnement…)
  options,
  completionSurPlace = false,
}: {
  orgId: string;
  code: CodeModele;
  cibleId: string;
  cheminRetour: string;
  libelle: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  options?: Record<string, string>;
  completionSurPlace?: boolean;
}) {
  const LienCompletion = completionSurPlace ? "a" : Link;
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<EtatGeneration | null>(null);

  const controle = useContext(CompletudeBail);
  const affichage = completionSurPlace ? actualiserControleGeneration(resultat, controle) : resultat;
  const [montrerTous, setMontrerTous] = useState(false);

  function generer() {
    setMontrerTous(false);
    setResultat(null);
    demarrer(async () => {
      try {
        const res = await genererDocument(orgId, code, cibleId, cheminRetour, options);
        setResultat(res);
        if (res.succes) afficherToast(res.succes);
      } catch {
        setResultat({ erreur: "La connexion a été interrompue. Vérifiez les documents du dossier avant de relancer la génération." });
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size={size} variant={variant} disabled={enCours} onClick={generer}>
        {enCours ? <><Spinner /> Génération…</> : libelle}
      </Button>
      {affichage?.documentId && (
        <a
          href={`/agence/${orgId}/documents/${affichage.documentId}/fichier`}
          target="_blank"
          rel="noreferrer"
          className="lien-discret text-xs"
        >
          Ouvrir le PDF
        </a>
      )}
      {affichage?.erreur && <span className="text-xs text-destructive">{affichage.erreur}</span>}
      {affichage && (affichage.manquants?.length ?? 0) > 0 && (
        <span className="block w-full text-xs text-warning-soft-foreground">
          À renseigner avant de générer le PDF :{" "}
          {affichage.manquants!.slice(0, montrerTous ? undefined : 5).map((m, i) => {
            const cible = lienPourManquant(m, orgId, affichage.liens ?? [], code);
            return (
              <span key={m}>
                {i > 0 && " · "}
                {m}
                {(cible || completionSurPlace) && (
                  <>
                    {" "}
                    <LienCompletion href={completionSurPlace ? cibleChampBail(m,orgId).href : cible!.href} className="lien-discret">
                      {completionSurPlace ? "Compléter ici" : `renseigner (${cible!.ecran})`} →
                    </LienCompletion>
                  </>
                )}
              </span>
            );
          })}
          {affichage.manquants!.length > 5 && (
            <button type="button" className="ml-2 lien-discret" aria-expanded={montrerTous} onClick={() => setMontrerTous(!montrerTous)}>
              {montrerTous ? "Réduire la liste" : `Voir les ${affichage.manquants!.length} informations à compléter`}
            </button>
          )}
        </span>
      )}
    </span>
  );
}
