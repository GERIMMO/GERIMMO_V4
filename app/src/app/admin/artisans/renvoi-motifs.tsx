"use client";

import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { renvoyerMotifsDecisionArtisan } from "@/app/actions/supervision-artisans";

/**
 * Audit palier 1 (P1-16) : l'e-mail des motifs d'un refus ou d'une suspension n'est pas parti (service d'envoi
 * indisponible, fiche sans adresse au moment de la décision…). Le superviseur le renvoie d'un geste ; la base refuse
 * de renvoyer une décision déjà notifiée ou remplacée.
 */
export function RenvoiMotifsArtisan({ artisanId }: { artisanId: string }) {
  const [etat, action, enCours] = useActionState(renvoyerMotifsDecisionArtisan.bind(null, artisanId), {});
  return (
    <form action={action} className="mt-2 space-y-2" data-renvoi-motifs data-saisie-confirmee>
      <BoutonEnvoi variant="outline" size="sm" enCours={enCours} enCoursTexte="Envoi…">Renvoyer l’e-mail des motifs</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}
    </form>
  );
}
