"use client";

import Link from "next/link";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { reglerBlocageSouscription, reglerOuvertureVentes, reglerVenteSansMediateur } from "@/app/actions/reglage-souscription";

/**
 * La carte de la règle de blocage (lib/garde-souscription.ts).
 *
 * `manquants` : ce qui manque au vendeur (faits requis, type de vendeur, mention « EI ») ; `aCompleter` : les
 * coordonnées du médiateur de la consommation encore vides.
 *
 * Reprise du 24/11/2026 (décision de pilotage, lot D7) : sans médiateur, la première souscription d'un particulier
 * reste fermée PAR DÉFAUT. La carte dit, sans jargon, ce que demandent les deux articles du recueil fourni par le
 * dirigeant (cités mot pour mot) et que la décision lui appartient. Elle n'écrit nulle part qu'ouvrir sans médiateur
 * est permis.
 *
 * Seconde reprise du 24/11/2026 (relecture T4R-02) : DEUX réglages, deux formulaires.
 *  - « Lever le blocage » ne concerne plus que les augmentations payantes d'un client déjà abonné quand l'identité du
 *    vendeur est incomplète (son sens d'avant le lot). Une levée enregistrée avant le lot n'ouvre donc rien d'autre.
 *  - Vendre aux particuliers sans médiateur est une décision à part : case « j'ai lu les deux articles » obligatoire,
 *    date posée par la base (`venteSansMediateurDepuis`, déjà mise en forme), inscription à l'historique, retrait
 *    possible à tout moment.
 */
export function BlocageSouscription({ actif, revision, manquants, aCompleter, venteSansMediateurDepuis }: {
  actif: boolean; revision: number | null; manquants: string[]; aCompleter: string[]; venteSansMediateurDepuis: string | null;
}) {
  const [etat, action, pending] = useActionState(reglerBlocageSouscription, {});
  const [etatVente, actionVente, pendingVente] = useActionState(reglerVenteSansMediateur, {});
  const sansMediateur = aCompleter.length > 0;
  const decidee = venteSansMediateurDepuis !== null;
  return (
    <section className="loc-carte space-y-4" aria-labelledby="regle-souscription">
      <div className="entete-carte">
        <h2 id="regle-souscription">Blocage des abonnements</h2>
        <span className={`puce ${actif ? "puce-prep" : "puce-loue"}`}>Règle {actif ? "active" : "levée"}</span>
      </div>
      <p className="text-sm">
        {actif
          ? "Règle active. Une identité du vendeur incomplète bloque toute première souscription et les augmentations payantes."
          : "Règle levée. Les augmentations payantes peuvent continuer même si l’identité du vendeur est incomplète. Toute première souscription, d’un particulier comme d’un professionnel, reste fermée tant que l’identité du vendeur est incomplète."}
        {" "}Cette règle ne décide pas de la vente aux particuliers sans médiateur de la consommation : voir plus bas.
      </p>
      {manquants.length > 0
        ? <p className="text-sm text-[var(--texte-secondaire)]">Identité du vendeur à compléter : {manquants.join(", ")}. Lever ce blocage ne complète pas les mentions légales et n’ouvre aucune première souscription.</p>
        : <p className="text-sm text-[var(--texte-secondaire)]">L’identité du vendeur est complète.</p>}
      <p className="text-sm text-[var(--texte-secondaire)]">Les contrôles Stripe, les montants, la confirmation du client et l’acceptation des conditions restent obligatoires. Aucun paiement n’est déclenché par ces boutons.</p>
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

      <div className="rounded-lg border border-[var(--filet)] p-3 text-sm space-y-2" aria-labelledby="vente-sans-mediateur">
        <h3 id="vente-sans-mediateur" className="font-semibold">Vente aux particuliers sans médiateur de la consommation</h3>
        {sansMediateur
          ? <p><b className="font-semibold">Médiateur de la consommation : aucun n’est saisi</b> (reste à compléter : {aCompleter.join(", ")}).</p>
          : <p>Le médiateur de la consommation est saisi : cette règle ne ferme la souscription d’aucun particulier.</p>}
        {(sansMediateur || decidee) && <>
          <p>Ce que dit le code de la consommation, dans le recueil de textes que vous avez fourni le 24/11/2026 :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>article L. 612-1 : « Tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable du litige qui l’oppose à un professionnel. A cet effet, le professionnel garantit au consommateur le recours effectif à un dispositif de médiation de la consommation. »</li>
            <li>article L. 616-1 : « Tout professionnel communique au consommateur, selon des modalités fixées par décret en Conseil d’Etat, les coordonnées du ou des médiateurs compétents dont il relève. »</li>
          </ul>
          <p>
            {decidee
              ? `Vous avez décidé, le ${venteSansMediateurDepuis}, de vendre aux particuliers sans médiateur${sansMediateur ? "" : " (un médiateur est saisi depuis : cette décision n’a plus d’effet)"}. Cette décision vous appartient, en tant que dirigeant ; elle est inscrite à l’historique des changements. La retirer referme la première souscription d’un particulier jusqu’à la saisie du médiateur.`
              : "C’est pourquoi la première souscription d’un particulier reste fermée tant que le médiateur n’est pas saisi dans « Médiateur de la consommation ». Vous pouvez décider d’ouvrir quand même la vente aux particuliers, sans médiateur : cette décision vous appartient, en tant que dirigeant. Elle est datée, inscrite à l’historique des changements, et se retire à tout moment. « Lever le blocage », ci-dessus, ne la remplace pas."}
          </p>
          <p>Dans les deux cas, les pages légales, l’écran d’abonnement et les courriels disent qu’aucun médiateur n’est désigné tant qu’aucun n’est saisi : rien n’est inventé.</p>
          {revision !== null && <form key={`${revision}-${decidee}`} action={actionVente} className="space-y-3" data-saisie-confirmee>
            <input type="hidden" name="revision" value={revision} />
            <input type="hidden" name="vente_sans_mediateur" value={decidee ? "retirer" : "decider"} />
            {!decidee && <label className="block"><input type="checkbox" name="lecture" value="oui" required /> J’ai lu les deux articles ci-dessus (L. 612-1 et L. 616-1 du code de la consommation) et je décide d’ouvrir la vente aux particuliers sans médiateur.</label>}
            <BoutonEnvoi variant="outline" size="lg" enCours={pendingVente} enCoursTexte="Enregistrement…">
              {decidee ? "Retirer cette décision" : "Ouvrir la vente aux particuliers sans médiateur"}
            </BoutonEnvoi>
          </form>}
        </>}
        {etatVente.erreur && <p role="alert" className="err">{etatVente.erreur}</p>}
        {etatVente.succes && <p role="status">{etatVente.succes}</p>}
      </div>
      <Link className="lien-discret inline-block" href="/admin/journaux?registre=supervision_identite">Historique des changements →</Link>
    </section>
  );
}

export function OuvertureVentes({ ouvertes, revision }: { ouvertes: boolean; revision: number | null }) {
  const [etat, action, pending] = useActionState(reglerOuvertureVentes, {});
  return <section className="loc-carte space-y-3">
    <h3>Nouvelles souscriptions payantes · {revision === null ? "État indisponible" : ouvertes ? "Ouvertes" : "Fermées"}</h3>
    <p>Les propriétaires du pilote gardent leur accès gratuit. Les abonnements en cours continuent normalement.</p>
    <p>L’ouverture demande une identité du vendeur complète (rubrique « Contact et entreprise ») : type de vendeur choisi, et mention « EI » pour un entrepreneur individuel.</p>
    <p>Sans médiateur de la consommation saisi, l’ouverture reste possible, mais la première souscription d’un particulier demeure fermée, sauf décision de votre part (voir « Vente aux particuliers sans médiateur de la consommation » ci-dessous).</p>
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
