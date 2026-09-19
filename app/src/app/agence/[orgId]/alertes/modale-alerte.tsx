"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  escaladerAlerte,
  fermerAlerte,
  type EtatAlerte,
} from "@/app/actions/alertes";
import { ASSIGNATION_TOUS } from "@/lib/alertes";
import { gesteAlerte } from "@/lib/chemin-alerte";
import { afficherEcheance } from "@/lib/echeances";
import { CRITICITES } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { afficherToast } from "@/components/ui/toast";

export type AlerteRang = {
  id: string;
  type?: string;
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

// À qui l'alerte est confiée. Trois écrans en avaient chacun leur copie
// (liste, tableau de bord, synthèse de connexion) : une seule suffit.
export function nomAssignation(
  alerte: { assigned_all: boolean; assignee_account_id: string | null },
  membres: Membre[]
): string {
  if (alerte.assigned_all) return "tout le monde";
  return (
    membres.find((m) => m.account_id === alerte.assignee_account_id)?.email ?? "—"
  );
}

// Modale de traitement (maquette « Traiter l'alerte ») : tête colorée par la
// criticité, LE GESTE D'ABORD, puis confier à quelqu'un, puis — en dernier —
// marquer traitée en disant ce qui a été fait. Partagée : page Alertes,
// tableau de bord et cloche l'ouvrent SUR PLACE (recette 24/08 — plus de
// redirection vers l'onglet Alertes).
//
// L'ORDRE EST LE CORRECTIF DU 19/09. Devant « défaut d'assurance persistant »,
// cette modale ne proposait que de confier l'alerte ou d'écrire ce qu'on avait
// fait : rien pour ALLER DÉPOSER l'attestation, qui est pourtant le seul geste
// qui règle quoi que ce soit. Et pour les douze types qui se referment seuls
// (voir SE_FERMENT_SEULES), « marquer traitée » n'est même pas le chemin
// normal — c'est la sortie de secours quand le geste a eu lieu ailleurs. Elle
// se replie donc, au lieu d'occuper la place du geste.
export function ModaleAlerte({
  orgId,
  alerte,
  membres,
  estResponsable,
  fermer,
}: {
  orgId: string;
  alerte: AlerteRang;
  membres: Membre[];
  estResponsable: boolean;
  fermer: () => void;
}) {
  // Le toast se déclenche ICI, à la résolution de l'action — pas dans un
  // effet : la revalidation retire la ligne (et cette modale) dans le même
  // commit React que le succès, un effet local n'aurait jamais tourné.
  const confierLiee = async (etat: EtatAlerte, formData: FormData) => {
    const res = await escaladerAlerte(orgId, alerte.id, etat, formData);
    if (res.succes) afficherToast(res.succes);
    return res;
  };
  const traiterLiee = async (etat: EtatAlerte, formData: FormData) => {
    const res = await fermerAlerte(orgId, alerte.id, etat, formData);
    if (res.succes) afficherToast(res.succes);
    return res;
  };
  const [etatConfier, actionConfier] = useActionState<
    EtatAlerte,
    FormData
  >(confierLiee, {});
  const [etatTraiter, actionTraiter] = useActionState<
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
  const geste = gesteAlerte(alerte, orgId);
  // Quand l'alerte se referme seule, la clore à la main est l'exception : le
  // bloc reste accessible mais replié, pour qu'on ne le prenne pas pour la
  // marche à suivre. Sans geste connu, il est la marche à suivre — donc ouvert.
  const [clotureOuverte, setClotureOuverte] = useState(
    !geste || !geste.seFermeSeule
  );

  return (
    <Modale
      titre={alerte.titre}
      surtitre={`${CRITICITES[alerte.criticite] ?? alerte.criticite} · confiée à ${nomAssignation(alerte, membres)}`}
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

      {/* LE GESTE, EN PREMIER ET EN GRAND. C'est la seule chose de cette modale
          qui règle l'alerte ; tout le reste la déplace ou la déclare close. */}
      {geste && (
        <div className="geste-alerte">
          <Link href={geste.href} onClick={fermer} className="btn-or w-full justify-center">
            {geste.libelle}
            <span aria-hidden> →</span>
          </Link>
          <p className="mt-2 mb-0 text-[13px] text-muted-foreground">
            {geste.seFermeSeule
              ? "Faites-le et l’alerte se refermera d’elle-même : c’est le dépôt qui la clôt, pas cette fenêtre."
              : "Vous reviendrez clore l’alerte ici une fois le geste fait."}
          </p>
        </div>
      )}

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
            <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
              Confier
            </BoutonEnvoi>
          </div>
          {etatConfier.erreur && (
            <p className="err mt-1.5 mb-0" role="alert">
              {etatConfier.erreur}
            </p>
          )}
        </form>
      )}

      {/* La clôture à la main. Repliée quand l'alerte se referme seule : la
          proposer au même rang que le geste apprenait à clore sans faire. */}
      {!clotureOuverte ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setClotureOuverte(true)}
            className="lien-discret text-[13px]"
          >
            Déjà réglé en dehors de Gerimmo ? Clore à la main
          </button>
          <Button type="button" variant="ghost" size="sm" onClick={fermer}>
            Fermer
          </Button>
        </div>
      ) : (
        <form action={actionTraiter} className="space-y-1.5">
          <label htmlFor="traiter-action" className="libelle-champ">
            Marquer traitée — ce qui a été fait
          </label>
          {geste?.seFermeSeule && (
            <p className="mt-0 mb-1 text-[13px] text-muted-foreground">
              À n’employer que si le geste a eu lieu ailleurs : déposé dans
              Gerimmo, il aurait fermé l’alerte tout seul.
            </p>
          )}
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
            <p className="err mt-1.5 mb-0" role="alert">
              {etatTraiter.erreur}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={fermer}>
              Annuler
            </Button>
            <BoutonEnvoi size="sm" enCoursTexte="Validation…">
              Valider
            </BoutonEnvoi>
          </div>
        </form>
      )}
    </Modale>
  );
}
