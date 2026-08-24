"use client";
import { afficherEcheance } from "@/lib/echeances";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CRITICITES, ORDRE_CRITICITE, COULEURS_CRITICITE } from "@/lib/ged";
import { buttonVariants } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { ModaleAlerte } from "@/app/agence/[orgId]/alertes/modale-alerte";

// Pop-up de synthèse des alertes à la connexion (S2, revue recette 08/08) :
// uniquement les alertes qui me sont confiées (nominativement ou « tout le
// monde »), puis accès au détail pour répondre et fermer. Jamais bloquante
// (Échap, clic extérieur, bouton Fermer en pied — seul bouton de sortie) ;
// s'affiche une fois par session, rappelable via la cloche en permanence.

export type AlerteSynthese = {
  id: string;
  organization_id: string;
  organisation: string;
  criticite: string;
  titre: string;
  echeance: string | null;
  created_at: string;
  assignee_account_id: string | null;
  assigned_all: boolean;
  escalades: unknown;
  details: Record<string, unknown> | null;
};

// Le drapeau « déjà vue » vit dans le sessionStorage, qui survit à la
// déconnexion tant que l'onglet reste ouvert : la page de connexion le remet
// à zéro, sinon une reconnexion dans le même onglet n'ouvrirait plus la synthèse.
export const CLE_SESSION_ALERTES = "gerimmo-synthese-alertes-vue";

export function ClocheAlertes({
  alertes,
  modeAdmin = false,
  surEncre = false,
  membres,
  estResponsable = false,
}: {
  alertes: AlerteSynthese[];
  // Console SA : le détail renvoie vers la fiche agence de la console,
  // pas vers l'espace agence (dont le SA n'est pas membre)
  modeAdmin?: boolean;
  // Bandeau encre de la maquette : la cloche s'éclaircit
  surEncre?: boolean;
  // Fournis par le layout agence (recette 24/08) : « Traiter » ouvre alors la
  // pop-up SUR PLACE. Sans eux (page /espaces, console SA), repli navigation.
  membres?: { account_id: string; email: string; role: string }[];
  estResponsable?: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);
  // Pop-up de traitement OUVERTE SUR PLACE (recette 24/08) : son état vit au
  // niveau de la cloche — la synthèse se referme, la modale de traitement
  // survit à ce démontage.
  const [traitement, setTraitement] = useState<AlerteSynthese | null>(null);

  // À la connexion : ouverture automatique une seule fois par session, et
  // seulement s'il existe des alertes qui me sont confiées. Le drapeau « vue »
  // se pose à la FERMETURE, pas à l'ouverture : la page-relais /espaces monte
  // ce composant puis redirige aussitôt — poser le drapeau à l'ouverture y
  // « consommait » la synthèse sans que personne ne l'ait vue.
  useEffect(() => {
    if (alertes.length === 0 || sessionStorage.getItem(CLE_SESSION_ALERTES)) return;
    // Ouverture différée d'un tick : évite un re-rendu en cascade à l'hydratation
    const minuterie = setTimeout(() => setOuverte(true), 0);
    return () => clearTimeout(minuterie);
  }, [alertes.length]);

  const fermer = useCallback(() => {
    sessionStorage.setItem(CLE_SESSION_ALERTES, "1");
    setOuverte(false);
  }, []);

  const triees = [...alertes].sort((a, b) => {
    const parCriticite =
      (ORDRE_CRITICITE[a.criticite] ?? 9) - (ORDRE_CRITICITE[b.criticite] ?? 9);
    if (parCriticite !== 0) return parCriticite;
    return a.created_at.localeCompare(b.created_at); // la plus ancienne d'abord
  });
  const nbCritiques = alertes.filter((a) => a.criticite === "critique").length;
  // Regroupement par id d'agence (deux agences homonymes restent distinctes)
  const parAgence = new Map<string, { nom: string; liste: AlerteSynthese[] }>();
  for (const a of triees) {
    const groupe = parAgence.get(a.organization_id) ?? { nom: a.organisation, liste: [] };
    groupe.liste.push(a);
    parAgence.set(a.organization_id, groupe);
  }
  const multiAgences = parAgence.size > 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuverte(true)}
        aria-label={`Alertes qui me sont confiées : ${alertes.length}`}
        className={`relative inline-flex items-center transition-colors ${
          surEncre
            ? "text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-[1.15rem]"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {/* Charte : une pastille suffit à signaler, le compte est dans l'onglet */}
        {alertes.length > 0 && (
          <span
            aria-hidden
            className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ${
              nbCritiques > 0 ? "bg-[var(--destructive)]" : "bg-[var(--or)]"
            } ${surEncre ? "ring-2 ring-[var(--encre)]" : ""}`}
          />
        )}
      </button>

      {ouverte && (
        /* Modale unique de la charte (recette 22/08) — posée en haut, sortie
           par le bouton Fermer en pied (revue 08/08), Échap et voile aussi */
        <Modale
          titre={
            alertes.length === 0
              ? "Aucune alerte ne vous attend"
              : `${alertes.length} alerte${alertes.length > 1 ? "s" : ""} à traiter`
          }
          surtitre={
            nbCritiques > 0
              ? `dont ${nbCritiques} critique${nbCritiques > 1 ? "s" : ""}`
              : undefined
          }
          haut
          large
          fermer={fermer}
          pied={
            <button
              type="button"
              onClick={fermer}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Fermer
            </button>
          }
        >
            <div className="max-h-[55vh] overflow-y-auto">
              {alertes.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Rien ne vous est confié — tout est traité.
                </p>
              ) : (
                [...parAgence.entries()].map(([agenceId, groupe]) => (
                  <div key={agenceId} className="py-2">
                    {multiAgences && (
                      <p className="eyebrow pb-1">{groupe.nom}</p>
                    )}
                    <ul className="divide-y divide-border">
                      {groupe.liste.map((a) => {
                        const echeance = afficherEcheance(a.echeance);
                        return (
                        <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                          <span
                            className={`badge-statut shrink-0 ${COULEURS_CRITICITE[a.criticite] ?? ""}`}
                          >
                            {CRITICITES[a.criticite] ?? a.criticite}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{a.titre}</span>
                          {echeance && (
                            <span className={`shrink-0 text-xs ${echeance.classe}`}>
                              {echeance.texte}
                            </span>
                          )}
                          {/* Recette 24/08 : « Traiter » ouvre la pop-up SUR
                              L'ÉCRAN COURANT ; une alerte incident emmène au
                              dossier, dans l'onglet Incidents. */}
                          {modeAdmin ? (
                            <Link
                              href={`/admin/organisations/${a.organization_id}`}
                              onClick={fermer}
                              className="shrink-0 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                            >
                              Traiter
                            </Link>
                          ) : typeof a.details?.incident_id === "string" ? (
                            <Link
                              href={`/agence/${a.organization_id}/incidents?sel=${a.details.incident_id}`}
                              onClick={fermer}
                              className="shrink-0 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                            >
                              Traiter
                            </Link>
                          ) : membres ? (
                            <button
                              type="button"
                              onClick={() => {
                                fermer();
                                setTraitement(a);
                              }}
                              className="shrink-0 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                            >
                              Traiter
                            </button>
                          ) : (
                            <Link
                              href={`/agence/${a.organization_id}/alertes?traiter=${a.id}`}
                              onClick={fermer}
                              className="shrink-0 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                            >
                              Traiter
                            </Link>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
        </Modale>
      )}

      {traitement && membres && (
        <ModaleAlerte
          orgId={traitement.organization_id}
          alerte={traitement}
          membres={membres}
          estResponsable={estResponsable}
          nomAssignation={
            traitement.assigned_all
              ? "tout le monde"
              : (membres.find((m) => m.account_id === traitement.assignee_account_id)
                  ?.email ?? "—")
          }
          fermer={() => setTraitement(null)}
        />
      )}
    </>
  );
}
