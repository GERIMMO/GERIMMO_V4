"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { accepterNouvelleVersionConditions, type EtatAcceptationConditions } from "@/app/actions/acceptation-conditions";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { CLE_REPORT_CONDITIONS } from "@/lib/conditions-acceptation";

/**
 * « Nos conditions générales évoluent » (plan de conformité du 23/10/2026, lot 1A, constat R19).
 *
 * Un encart en tête de l'espace, jamais une fenêtre qui bloque : la personne peut continuer à travailler, et rien n'est
 * fermé pendant une période payée. « J'accepte la nouvelle version » enregistre l'accord (ajout seul, heure du serveur) ;
 * « Plus tard » masque l'encart jusqu'à la prochaine connexion, dans tous les onglets de ce navigateur (stockage local,
 * aucun témoin ; la valeur porte la version et l'heure de la connexion, qu'une nouvelle connexion change). Relecture
 * adverse du 24/10 (défaut 6) : gardé dans le stockage de session de l'onglet, il revenait dans chaque nouvel onglet.
 * Un onglet déjà ouvert le masque aussitôt (événement « storage »). Rendu par le serveur, l'encart reste visible sans
 * script ; la personne qui a choisi « Plus tard » peut le voir un instant au chargement complet d'une page, avant
 * l'hydratation : l'éviter demanderait un témoin lu par le serveur, que la politique de confidentialité ne prévoit pas.
 * Le bouton d'acceptation attend la fin du chargement de la page, comme tout bouton d'envoi hors de la liste fermée des
 * formulaires d'authentification (tests/bouton-envoi-hydratation.test.ts).
 */

const EVENEMENT = "gerimmo-conditions-plus-tard";

function sAbonner(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}
function lireReport(): string | null {
  try {
    return window.localStorage.getItem(CLE_REPORT_CONDITIONS);
  } catch {
    return null;
  }
}
const aucunReport = () => null;

export function EcranNouvelleVersionConditions({
  orgId,
  version,
  dateVersion,
  paragraphes,
  report,
}: {
  orgId: string;
  version: string;
  dateVersion: string;
  paragraphes: string[];
  /** La valeur qui, gardée par « Plus tard », masque l'encart pendant cette connexion (lib/conditions-acceptation.ts). */
  report: string;
}) {
  const [etat, action] = useActionState<EtatAcceptationConditions, FormData>(
    accepterNouvelleVersionConditions.bind(null, orgId),
    {}
  );
  const reporte = useSyncExternalStore(sAbonner, lireReport, aucunReport) === report;

  if (etat.succes) {
    return (
      <p role="status" className="mx-4 mt-4 rounded-lg border border-[var(--trait)] bg-[var(--success-soft)] px-4 py-3 text-sm">
        {etat.succes}
      </p>
    );
  }
  if (reporte) return null;

  const plusTard = () => {
    try {
      window.localStorage.setItem(CLE_REPORT_CONDITIONS, report);
    } catch {
      // Stockage refusé (navigation privée stricte) : l'encart reste, rien d'autre ne change.
    }
    window.dispatchEvent(new Event(EVENEMENT));
  };

  return (
    <section aria-labelledby="titre-nouvelle-version" className="loc-carte mx-4 mt-4 space-y-3 text-sm leading-relaxed">
      <h2 id="titre-nouvelle-version" className="text-[length:var(--pas-section)]">
        Nos conditions générales évoluent
      </h2>
      {paragraphes.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p>
        <Link href="/conditions" target="_blank" rel="noopener" className="lien-texte">
          Lire la version du {dateVersion}
        </Link>
        {" · "}
        <Link href="/conditions/versions" target="_blank" rel="noopener" className="lien-texte">
          Versions archivées
        </Link>
      </p>
      <form data-saisie-libre action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="cgu_version" value={version} />
        <BoutonEnvoi enCoursTexte="Enregistrement…">
          J’accepte la nouvelle version
        </BoutonEnvoi>
        <Button type="button" variant="outline" onClick={plusTard}>
          Plus tard
        </Button>
      </form>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </section>
  );
}
