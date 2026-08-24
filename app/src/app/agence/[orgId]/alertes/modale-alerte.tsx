"use client";

import { useActionState, useEffect } from "react";
import {
  escaladerAlerte,
  fermerAlerte,
  type EtatAlerte,
} from "@/app/actions/alertes";
import { ASSIGNATION_TOUS } from "@/lib/alertes";
import { afficherEcheance } from "@/lib/echeances";
import { CRITICITES } from "@/lib/ged";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";

export type AlerteRang = {
  id: string;
  criticite: string;
  titre: string;
  echeance: string | null;
  created_at: string;
  assignee_account_id: string | null;
  assigned_all: boolean;
  escalades: unknown;
  details: Record<string, unknown> | null;
};

export type Membre = { account_id: string; email: string; role: string };

// Modale de traitement (maquette « Traiter l'alerte ») : tête colorée par la
// criticité, deux gestes — confier à quelqu'un, ou marquer traitée en disant
// ce qui a été fait (obligatoire), puis valider. Partagée : page Alertes,
// tableau de bord et cloche l'ouvrent SUR PLACE (recette 24/08 — plus de
// redirection vers l'onglet Alertes).
export function ModaleAlerte({
  orgId,
  alerte,
  membres,
  estResponsable,
  nomAssignation,
  fermer,
}: {
  orgId: string;
  alerte: AlerteRang;
  membres: Membre[];
  estResponsable: boolean;
  nomAssignation: string;
  fermer: () => void;
}) {
  const confierLiee = escaladerAlerte.bind(null, orgId, alerte.id);
  const traiterLiee = fermerAlerte.bind(null, orgId, alerte.id);
  const [etatConfier, actionConfier, confierEnCours] = useActionState<
    EtatAlerte,
    FormData
  >(confierLiee, {});
  const [etatTraiter, actionTraiter, traiterEnCours] = useActionState<
    EtatAlerte,
    FormData
  >(traiterLiee, {});

  // Le geste a abouti : la modale se referme, la liste se recharge d'elle-même
  useEffect(() => {
    if (etatConfier.succes || etatTraiter.succes) fermer();
  }, [etatConfier.succes, etatTraiter.succes, fermer]);

  const echeance = afficherEcheance(alerte.echeance);
  const nbEscalades = Array.isArray(alerte.escalades)
    ? alerte.escalades.length
    : 0;

  return (
    <Modale
      titre={alerte.titre}
      surtitre={`${CRITICITES[alerte.criticite] ?? alerte.criticite} · confiée à ${nomAssignation}`}
      variante={alerte.criticite === "critique" ? "critique" : "encre"}
      fermer={fermer}
    >
      <div className="text-sm text-muted-foreground">
        {echeance ? (
          <p>
            Échéance : <span className={echeance.classe}>{echeance.texte}</span>
          </p>
        ) : (
          <p>Sans échéance.</p>
        )}
        {nbEscalades > 0 && <p>Transmise {nbEscalades} fois.</p>}
      </div>

      {alerte.criticite !== "informative" && (
        <form action={actionConfier} className="space-y-1.5">
          <label htmlFor="confier-vers" className="libelle-champ">
            Confier à
          </label>
          <select
            id="confier-vers"
            name="vers"
            required
            defaultValue={etatConfier.valeurs?.vers ?? ""}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="" disabled>
              — Choisir —
            </option>
            {/* Seul le responsable peut assigner à tout le monde */}
            {estResponsable && !alerte.assigned_all && (
              <option value={ASSIGNATION_TOUS}>Tout le monde</option>
            )}
            {membres
              .filter((m) => m.account_id !== alerte.assignee_account_id)
              .map((m) => (
                <option key={m.account_id} value={m.account_id}>
                  {m.email}
                </option>
              ))}
          </select>
          {/* Recette 13/08 : on ne confie jamais sans un mot au destinataire */}
          <label htmlFor="confier-message" className="libelle-champ">
            Message au destinataire
          </label>
          <div className="flex items-start gap-2">
            <textarea
              id="confier-message"
              name="message"
              required
              rows={2}
              placeholder="Pourquoi vous lui confiez cette alerte…"
              defaultValue={etatConfier.valeurs?.message}
              className="w-full flex-1 rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
            />
            <Button variant="outline" size="sm" type="submit" disabled={confierEnCours}>
              {confierEnCours ? "…" : "Confier"}
            </Button>
          </div>
          {etatConfier.erreur && (
            <p className="text-sm text-destructive">{etatConfier.erreur}</p>
          )}
        </form>
      )}

      <form action={actionTraiter} className="space-y-1.5">
        <label htmlFor="traiter-action" className="libelle-champ">
          Marquer traitée — ce qui a été fait
        </label>
        <textarea
          id="traiter-action"
          name="action_effectuee"
          required
          rows={2}
          placeholder="Ce que vous avez fait…"
          defaultValue={etatTraiter.valeurs?.action_effectuee}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
        />
        {etatTraiter.erreur && (
          <p className="text-sm text-destructive">{etatTraiter.erreur}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={fermer}>
            Annuler
          </Button>
          <Button type="submit" size="sm" disabled={traiterEnCours}>
            {traiterEnCours ? "Validation…" : "Valider"}
          </Button>
        </div>
      </form>
    </Modale>
  );
}
