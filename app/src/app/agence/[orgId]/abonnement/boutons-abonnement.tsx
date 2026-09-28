"use client";

import { useActionState, useId, useState } from "react";
import {
  confirmerHausse,
  demanderPeriodicite,
  demarrerAbonnement,
  ouvrirPortailAbonnement,
  resilierAbonnement,
  type EtatAbonnementAction,
} from "@/app/actions/abonnement";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

// Les deux gestes de l'abonnement. Ils partent vers Stripe : en cas de succès,
// l'action REDIRIGE et ce composant ne revoit jamais la main — seul l'échec
// remonte ici, et il remonte en français.

export function BoutonSouscrire({ orgId, libelle }: { orgId: string; libelle: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(
    demarrerAbonnement.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <BoutonEnvoi enCoursTexte="Ouverture du paiement…">{libelle}</BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

export function BoutonPortail({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(
    ouvrirPortailAbonnement.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <BoutonEnvoi variant="outline" enCoursTexte="Ouverture…">
        Gérer mon abonnement
      </BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

function Erreur({ texte }: { texte?: string }) {
  return texte ? (
    <p role="alert" className="text-sm text-destructive">
      {texte}
    </p>
  ) : null;
}

/**
 * Confirmer une hausse : les montants viennent du serveur (aperçu Stripe), la
 * case doit être cochée, et l'action recalcule tout avant d'appliquer.
 */
export function FormulaireHausse({
  orgId,
  unites,
  formule,
  montantCents,
  immediatCents,
  prorationDate,
  libelleConfirmation,
}: {
  orgId: string;
  unites: number;
  formule: string | null;
  montantCents: number;
  immediatCents: number;
  prorationDate: number;
  libelleConfirmation: string;
}) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(confirmerHausse.bind(null, orgId), {});
  const [confirme, setConfirme] = useState(false);
  const id = useId();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="unites" value={unites} />
      <input type="hidden" name="formule" value={formule ?? ""} />
      <input type="hidden" name="montant_attendu_cents" value={montantCents} />
      <input type="hidden" name="immediat_attendu_cents" value={immediatCents} />
      <input type="hidden" name="proration_date" value={prorationDate} />
      <input type="hidden" name="confirmation" value={confirme ? "oui" : "non"} />
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input id={id} type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-1" />
        <span>{libelleConfirmation}</span>
      </label>
      <BoutonEnvoi enCoursTexte="Application du changement…" disabled={!confirme}>
        Confirmer ce changement
      </BoutonEnvoi>
      <Erreur texte={etat.erreur} />
    </form>
  );
}

/** Demander l'autre périodicité pour la prochaine échéance. */
export function FormulairePeriodicite({ orgId, vers, libelle }: { orgId: string; vers: "mensuel" | "annuel"; libelle: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(demanderPeriodicite.bind(null, orgId), {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="periodicite" value={vers} />
      <BoutonEnvoi variant="outline" enCoursTexte="Enregistrement…">
        {libelle}
      </BoutonEnvoi>
      <Erreur texte={etat.erreur} />
    </form>
  );
}

/** Résilier pour l'échéance, ou revenir sur la résiliation. */
export function BoutonResiliation({ orgId, resilier, libelle }: { orgId: string; resilier: boolean; libelle: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(resilierAbonnement.bind(null, orgId), {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="resilier" value={resilier ? "oui" : "non"} />
      <BoutonEnvoi variant="outline" enCoursTexte="Enregistrement…">
        {libelle}
      </BoutonEnvoi>
      <Erreur texte={etat.erreur} />
    </form>
  );
}
