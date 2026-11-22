"use client";

import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { reglerEnvoiAutomatique } from "@/app/actions/envois-automatiques-reglage";
import { FLUX_ENVOIS_AUTOMATIQUES, LIBELLES_ENVOIS_AUTOMATIQUES, type FluxEnvoiAutomatique } from "@/lib/envois-suspendus";

export type EtatEnvoisAutomatiques = Record<FluxEnvoiAutomatique, boolean>;
/** Combien d'espaces ont déjà donné leur accord permanent (avis d'échéance, relance) : null = non lu. */
export type AccordsEspaces = { avis_echeance: number | null; relance_loyer: number | null };

/** Ce que l'ouverture déclenche tout de suite, dit avant de cocher. Rien à dire pour les envois sans accord d'espace. */
export function phraseAccords(flux: FluxEnvoiAutomatique, ouvert: boolean, accords: AccordsEspaces | undefined): string | null {
  if (flux !== "avis_echeance" && flux !== "relance_loyer") return null;
  const n = accords?.[flux];
  if (n === null || n === undefined) return null;
  if (n === 0) return ouvert ? "Aucun espace n’a encore donné son accord : rien ne part pour le moment." : "Aucun espace n’a donné son accord : ouvert, rien ne partira tant qu’un espace ne l’aura pas demandé dans son profil.";
  const espaces = `${n} espace${n > 1 ? "s ont" : " a"}`;
  return ouvert ? `${espaces} donné ${n > 1 ? "leur" : "son"} accord.` : `${espaces} déjà donné ${n > 1 ? "leur" : "son"} accord : ${n > 1 ? "leurs" : "ses"} e-mails partiront dès l’ouverture.`;
}

/** Combien d'envois sont ouverts — pour la carte de résumé de la page. */
export function envoisOuverts(etat: EtatEnvoisAutomatiques | null): number | null {
  return etat ? FLUX_ENVOIS_AUTOMATIQUES.filter((f) => etat[f] === true).length : null;
}

/**
 * Les quatre envois automatiques prévus et suspendus (audit palier 1, P1-08), chacun avec son interrupteur.
 * `etat` : le réglage enregistré (null = illisible). Tout est fermé à la livraison ; seul le superviseur permanent
 * ouvre, envoi par envoi, après une confirmation explicite. Fermé, rien ne change par rapport à avant ce réglage.
 */
export function EnvoisAutomatiques({ etat, accords }: { etat: EtatEnvoisAutomatiques | null; accords?: AccordsEspaces }) {
  const ouverts = envoisOuverts(etat);
  return (
    <section className="loc-carte space-y-4" aria-labelledby="titre-envois-automatiques" data-envois-automatiques={ouverts === null ? "illisible" : String(ouverts)}>
      <div className="entete-carte">
        <h2 id="titre-envois-automatiques">Envois automatiques d’e-mails</h2>
        <span className={`puce ${ouverts ? "puce-loue" : "puce-prep"}`}>
          {ouverts === null ? "État indisponible" : ouverts === 0 ? "Tous fermés" : `${ouverts} ouvert${ouverts > 1 ? "s" : ""} sur ${FLUX_ENVOIS_AUTOMATIQUES.length}`}
        </span>
      </div>
      <p className="text-sm">
        Quatre e-mails automatiques sont prêts mais ne partent pas tant que vous ne les ouvrez pas, un par un. Fermé,
        rien n’est envoyé et rien n’est perdu : chaque loyer, relance ou rendez-vous reste visible dans les espaces, et
        se traite à la main.
      </p>
      {etat === null ? (
        <p role="alert" className="err">Le réglage des envois automatiques ne peut pas être lu. Il est visible par un superviseur, avec sa double vérification. Rechargez la page avant de le modifier.</p>
      ) : (
        <ul className="space-y-3">
          {FLUX_ENVOIS_AUTOMATIQUES.map((flux) => <EnvoiAutomatique key={flux} flux={flux} ouvert={etat[flux] === true} accords={phraseAccords(flux, etat[flux] === true, accords)} />)}
        </ul>
      )}
      <p className="text-sm text-[var(--texte-secondaire)]">
        Ouvert, un envoi ne part que si la base confirme, juste avant, qu’il est toujours dû à cette adresse ; un arrêt
        d’urgence le retient aussi. Les deux premiers ne concernent que les espaces qui ont demandé l’envoi automatique
        dans leurs réglages. Chaque ouverture ou fermeture est inscrite au journal de la supervision.
      </p>
    </section>
  );
}

function EnvoiAutomatique({ flux, ouvert, accords }: { flux: FluxEnvoiAutomatique; ouvert: boolean; accords: string | null }) {
  const [retour, action, pending] = useActionState(reglerEnvoiAutomatique, {});
  const { titre, detail } = LIBELLES_ENVOIS_AUTOMATIQUES[flux];
  const confirmation = `confirmation-${flux}`;
  return (
    <li className="rounded-lg border border-[var(--bordure)] p-4" data-envoi-automatique={flux} data-ouvert={ouvert ? "oui" : "non"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 font-semibold">{titre}</p>
        <span className={`puce ${ouvert ? "puce-loue" : "puce-prep"}`}>{ouvert ? "Ouvert" : "Fermé"}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--texte-secondaire)]">{detail}</p>
      {accords && <p className="mt-1 text-sm font-semibold" data-accords-espaces>{accords}</p>}
      <form action={action} className="mt-3 space-y-3" data-saisie-confirmee>
        <input type="hidden" name="flux" value={flux} />
        <input type="hidden" name="choix" value={ouvert ? "fermer" : "ouvrir"} />
        {!ouvert && (
          <label htmlFor={confirmation} className="flex items-start gap-2 text-sm">
            <input id={confirmation} type="checkbox" name="confirmation" value="oui" required className="mt-1" />
            <span>Je confirme : de vrais e-mails partiront aux personnes concernées dès la prochaine passe.</span>
          </label>
        )}
        <BoutonEnvoi variant={ouvert ? "outline" : "default"} enCours={pending} enCoursTexte="Enregistrement…">
          {ouvert ? "Fermer cet envoi" : "Ouvrir cet envoi"}
        </BoutonEnvoi>
      </form>
      {retour.erreur && <p role="alert" className="err mt-2">{retour.erreur}</p>}
      {retour.succes && <p role="status" className="mt-2 text-sm">{retour.succes}</p>}
    </li>
  );
}
