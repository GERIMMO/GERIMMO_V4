"use client";

import Link from "next/link";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { reglerBlocageSouscription, reglerOuvertureVentes } from "@/app/actions/reglage-souscription";

/**
 * La carte de la règle de blocage (lib/garde-souscription.ts).
 *
 * `manquants` : ce qui manque au vendeur (faits requis, mention « EI ») ; `aCompleter` : les coordonnées du médiateur
 * de la consommation encore vides.
 *
 * Reprise du 24/11/2026 (décision de pilotage, lot D7) : sans médiateur, la première souscription d'un particulier
 * reste fermée PAR DÉFAUT ; lever le blocage l'ouvre quand même. La carte dit alors, sans jargon, ce que demandent les
 * deux articles du recueil fourni par le dirigeant (cités mot pour mot) et que la décision lui appartient. Elle
 * n'écrit nulle part qu'ouvrir sans médiateur est permis.
 */
export function BlocageSouscription({ actif, revision, manquants, aCompleter }: {
  actif: boolean; revision: number | null; manquants: string[]; aCompleter: string[];
}) {
  const [etat, action, pending] = useActionState(reglerBlocageSouscription, {});
  const sansMediateur = aCompleter.length > 0;
  return (
    <section className="loc-carte space-y-4" aria-labelledby="regle-souscription">
      <div className="entete-carte">
        <h2 id="regle-souscription">Blocage des abonnements</h2>
        <span className={`puce ${actif ? "puce-prep" : "puce-loue"}`}>Règle {actif ? "active" : "levée"}</span>
      </div>
      <p className="text-sm">
        {actif
          ? "Règle active. Sans médiateur de la consommation saisi, un particulier ne peut pas souscrire pour la première fois ; les professionnels ne sont pas concernés. Une identité du vendeur incomplète bloque toute première souscription et les augmentations payantes."
          : "Règle levée. Un particulier peut souscrire même si aucun médiateur de la consommation n’est saisi, et les augmentations payantes peuvent continuer même si l’identité du vendeur est incomplète. Toute première souscription, d’un particulier comme d’un professionnel, reste fermée tant que l’identité du vendeur est incomplète."}
      </p>
      {manquants.length > 0
        ? <p className="text-sm text-[var(--texte-secondaire)]">Identité du vendeur à compléter : {manquants.join(", ")}. Lever ce blocage ne complète pas les mentions légales et n’ouvre aucune première souscription.</p>
        : <p className="text-sm text-[var(--texte-secondaire)]">L’identité du vendeur est complète.</p>}
      {sansMediateur
        ? <div className="rounded-lg border border-[var(--filet)] p-3 text-sm space-y-2">
          <p><b className="font-semibold">Médiateur de la consommation : aucun n’est saisi</b> (reste à compléter : {aCompleter.join(", ")}).</p>
          <p>Ce que dit le code de la consommation, dans le recueil de textes que vous avez fourni le 24/11/2026 :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>article L. 612-1 : « Tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable du litige qui l’oppose à un professionnel. A cet effet, le professionnel garantit au consommateur le recours effectif à un dispositif de médiation de la consommation. »</li>
            <li>article L. 616-1 : « Tout professionnel communique au consommateur, selon des modalités fixées par décret en Conseil d’Etat, les coordonnées du ou des médiateurs compétents dont il relève. »</li>
          </ul>
          <p>
            {actif
              ? "C’est pourquoi la première souscription d’un particulier reste fermée tant que le médiateur n’est pas saisi dans « Médiateur de la consommation ». Lever le blocage ouvre quand même la vente aux particuliers, sans médiateur : cette décision vous appartient, en tant que dirigeant. Elle est inscrite à l’historique des changements et se retire à tout moment (« Réactiver le blocage »)."
              : "Vous avez levé le blocage : la vente est ouverte aux particuliers sans médiateur. Cette décision vous appartient, en tant que dirigeant ; elle est inscrite à l’historique des changements. « Réactiver le blocage » referme la première souscription d’un particulier jusqu’à la saisie du médiateur."}
          </p>
          <p>Dans les deux cas, les pages légales, l’écran d’abonnement et les courriels disent qu’aucun médiateur n’est désigné : rien n’est inventé.</p>
        </div>
        : <p className="text-sm text-[var(--texte-secondaire)]">Le médiateur de la consommation est saisi : cette règle ne ferme la souscription d’aucun particulier.</p>}
      <p className="text-sm text-[var(--texte-secondaire)]">Les contrôles Stripe, les montants, la confirmation du client et l’acceptation des conditions restent obligatoires. Aucun paiement n’est déclenché par ce bouton.</p>
      {revision === null
        ? <p role="alert" className="err">Réglage indisponible. Rechargez la page avant de modifier.</p>
        : <form action={action} data-saisie-confirmee>
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="blocage" value={actif ? "lever" : "activer"} />
          <BoutonEnvoi variant={actif ? "default" : "outline"} size="lg" enCours={pending} enCoursTexte="Enregistrement…">
            {actif ? "Lever le blocage" : "Réactiver le blocage"}
          </BoutonEnvoi>
        </form>}
      {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
      {etat.succes && <p role="status">{etat.succes}</p>}
      <Link className="lien-discret inline-block" href="/admin/journaux?registre=supervision_identite">Historique des changements →</Link>
    </section>
  );
}

export function OuvertureVentes({ ouvertes, revision }: { ouvertes: boolean; revision: number | null }) {
  const [etat, action, pending] = useActionState(reglerOuvertureVentes, {});
  return <section className="loc-carte space-y-3">
    <h3>Nouvelles souscriptions payantes · {revision === null ? "État indisponible" : ouvertes ? "Ouvertes" : "Fermées"}</h3>
    <p>Les propriétaires du pilote gardent leur accès gratuit. Les abonnements en cours continuent normalement.</p>
    <p>L’ouverture demande une identité du vendeur complète (rubrique « Contact et entreprise »), mention « EI » comprise pour un entrepreneur individuel.</p>
    <p>Sans médiateur de la consommation saisi, l’ouverture reste possible, mais la première souscription d’un particulier demeure fermée (voir « Blocage des abonnements » ci-dessous).</p>
    {revision !== null && <form key={revision} action={action} className="space-y-3" data-saisie-confirmee>
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="ventes" value={ouvertes ? "fermer" : "ouvrir"} />
      {!ouvertes && <label className="block"><input type="checkbox" name="confirmation" value="oui" required /> J’autorise les nouvelles souscriptions payantes.</label>}
      <BoutonEnvoi enCours={pending} enCoursTexte="Enregistrement…">{ouvertes ? "Fermer les souscriptions" : "Ouvrir les souscriptions"}</BoutonEnvoi>
    </form>}
    {/* Relecture D7R-12 : le refus porte la liste de ce qui manque au vendeur ; il prend la couleur d'alerte. */}
    {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
    {etat.succes && <p role="status">{etat.succes}</p>}
  </section>;
}
