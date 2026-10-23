import { SuiviStripe, type ControleStripe } from "./controle-stripe";
import { BudgetSignatures, type BudgetSignature } from "./budget-signatures";
import { ouvertureSignatures } from "@/lib/ouverture-signatures";
import {lireEditeur} from '@/lib/editeur-serveur';
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { faitsACompleter, faitsManquants } from "@/lib/editeur";
import { EQUIPES } from "@/lib/missions";
import {
  adoptionAutomatique,
  chargerSante,
  type Etat,
  type EtatCycleMensuel,
  type EtatTache,
  type OrganisationPourAdoption,
  type Prestataire,
} from "@/lib/sante-service";
import { masquerAdresse } from "@/lib/relais-alerte";
import { DELAI_URGENCE_MAX_MINUTES } from "@/lib/relais-urgences";
import { adressesRelaisDuServeur } from "@/lib/relais-alerte-reglage";
import { LancerMission } from "./lancer-mission";

// Le nom de l'entrée de menu (audit 25/09, C8).
export const metadata = { title: "Santé et connexions" };

// Ce qui est posé, ce qui tourne, ce qui manque — sur un seul écran.
//
// Né de la préparation du lancement (20/09) : la tâche des abonnements
// n'avait jamais tourné en production, faute de Stripe, et rien ne le disait.
// Il ne montre JAMAIS une valeur d'environnement : la présence d'un secret est
// une information, le secret n'en est pas une ici.
//
// 25/09 (audit C5) : chaque ligne rouge porte la commande qui la règle — le nom
// de la variable et le prestataire chez qui l'obtenir, « Lancer maintenant »
// pour une tâche, ou l'aveu qu'aucun écran ne règle encore le point.

const PUCE_ETAT: Record<Etat, { classe: string; libelle: string }> = {
  ok: { classe: "puce-loue", libelle: "posée" },
  attention: { classe: "puce-prep", libelle: "à vérifier" },
  manque: { classe: "puce-rouge", libelle: "manque" },
};

const PUCE_TACHE: Record<EtatTache, { classe: string; libelle: string }> = {
  ok: { classe: "puce-loue", libelle: "à l'heure" },
  echec: { classe: "puce-rouge", libelle: "en échec" },
  retard: { classe: "puce-prep", libelle: "en retard" },
  jamais: { classe: "puce-rouge", libelle: "aucune exécution" },
  // Comme la sandbox Youtrust dans la liste des connexions (25/09) : à
  // vérifier, pas en échec — la connexion manquante est déjà comptée plus haut.
  non_configuree: { classe: "puce-prep", libelle: "non configurée — à vérifier" },
  // Audit console 27/09 : une mission en pause n'est pas une alerte.
  pause: { classe: "puce-grise", libelle: "en pause" },
};

// Le cycle mensuel (D07) : « jamais » n'est pas une panne annoncée (environnement neuf), « suspendu » est un arrêt voulu.
const PUCE_CYCLE: Record<EtatCycleMensuel, { classe: string; libelle: string }> = {
  ok: { classe: "puce-loue", libelle: "à l'heure" },
  retard: { classe: "puce-rouge", libelle: "en retard" },
  jamais: { classe: "puce-prep", libelle: "aucun passage — à vérifier" },
  suspendu: { classe: "puce-grise", libelle: "arrêt d'urgence" },
};

// Où la valeur s'obtient, sans lien inventé : le tableau de bord du prestataire
// la fournit, et elle se pose dans les variables d'environnement du projet
// Vercel (production), puis redéploiement.
const OU_OBTENIR: Record<Prestataire, string> = {
  Stripe: "tableau de bord Stripe (Développeurs → Clés API / Webhooks / Produits)",
  Resend: "tableau de bord Resend (Clés API / Domaines)",
  Yousign: "espace Yousign (API / Webhooks)",
  "Zoho Sign": "compte européen Zoho Sign (console API OAuth / Paramètres → Développeurs → Webhooks)",
  Vercel: "à choisir par le responsable technique",
  Supabase: "tableau de bord Supabase (Réglages du projet → API)",
  OpenAI: "plateforme OpenAI (Clés API ; le crédit se recharge dans Facturation)",
};

export default async function PageSante() {
  const supabase = await createClient();
  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  const [budgetSignature, controleStripe, reglageSignature] = await Promise.all([supabase.rpc("lire_budget_signatures"), supabase.rpc("supervision_stripe_controles"), supabase.from("signature_budget").select("devis_actif").eq("singleton",true).single()]);
  const ouverture = ouvertureSignatures(process.env, budgetSignature.error || reglageSignature.error || !budgetSignature.data ? null : {
    plafond: budgetSignature.data.plafond, utilise: budgetSignature.data.utilise, devisActif: reglageSignature.data?.devis_actif === true,
  });
  const identite=await lireEditeur();
  const manquants = faitsManquants(identite.indisponible?{}:identite.editeur);
  // 23/10 : le médiateur se complète plus tard, sans rien fermer (lib/editeur.ts, A_COMPLETER).
  const aCompleter = identite.indisponible ? [] : faitsACompleter(identite.editeur);
  // Les adresses de l'alerte du relais (réglage du serveur), affichées masquées seulement.
  const relais = adressesRelaisDuServeur();
  // Le même calcul que /admin et /admin/brief (25/09) : une seule requête du
  // journal, une seule fenêtre, un seul chiffre.
  const [sante, orgs] = await Promise.all([
    chargerSante(supabase, process.env, manquants.length),
    supabase
      .from("organizations")
      .select("status, quittances_envoi_auto, appels_envoi_auto, relances_envoi_auto"),
  ]);

  const { configuration, taches, cycleMensuel: cycle } = sante;
  const adoption = orgs.error
    ? null
    : adoptionAutomatique((orgs.data ?? []) as OrganisationPourAdoption[]);
  const cronPose = configuration.find((v) => v.cle === "CRON_SECRET")?.etat === "ok";

  const nbManque = configuration.filter((v) => v.etat === "manque").length;
  const nbAttention = configuration.filter((v) => v.etat === "attention").length;
  const nbPoints = taches === null ? null : sante.bloquants;
  const nbJamais = taches?.filter((t) => t.etat === "jamais").length ?? 0;
  const nbEchec = taches?.filter((t) => t.etat === "echec").length ?? 0;
  const nbRetard = taches?.filter((t) => t.etat === "retard").length ?? 0;
  const nbPause = taches?.filter((t) => t.etat === "pause").length ?? 0;
  // Une variable manquante ne compte qu'une fois, comme dans pointsBloquants.
  const nbManqueUniques = new Set(configuration.filter((v) => v.etat === "manque").map((v) => v.cle)).size;
  const nbNonConfigurees = taches?.filter((t) => t.etat === "non_configuree").length ?? 0;
  const detailPoints = [
    nbManqueUniques > 0 && `${nbManqueUniques} connexion${nbManqueUniques > 1 ? "s" : ""} manquante${nbManqueUniques > 1 ? "s" : ""}`,
    nbJamais > 0 && `${nbJamais} tâche${nbJamais > 1 ? "s" : ""} sans passage enregistré`,
    nbEchec > 0 && `${nbEchec} tâche${nbEchec > 1 ? "s" : ""} en échec`,
    nbRetard > 0 && `${nbRetard} tâche${nbRetard > 1 ? "s" : ""} en retard`,
    cycle?.etat === "retard" && "cycle mensuel en retard",
    manquants.length > 0 && "documents légaux incomplets",
  ].filter(Boolean).join(", ");
  const aVerifier = [
    nbAttention > 0 && `${nbAttention} connexion${nbAttention > 1 ? "s" : ""} à vérifier`,
    nbNonConfigurees > 0 && `${nbNonConfigurees} tâche${nbNonConfigurees > 1 ? "s" : ""} sans service relié`,
    nbPause > 0 && `${nbPause} mission${nbPause > 1 ? "s" : ""} en pause`,
  ].filter(Boolean).map((x) => ` · ${x}`).join("");
  // Les huit faits exigés, fournis ou non : `faitsManquants({})` les rend
  // tous, dans l'ordre de lib/editeur.ts ; puis ceux à compléter sans blocage.
  const faitsExiges = faitsManquants({});
  const faitsNonBloquants = faitsACompleter({});

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <div className="min-w-0 flex-[1_1_20rem]">
          <TitreEcran rubrique="sante">Santé et connexions</TitreEcran>
          <p className="mt-2 text-sm text-muted-foreground">
            Les services reliés à Gerimmo, le travail réalisé automatiquement et,
            pour chaque point rouge, la commande qui le règle.
          </p>
        </div>
        <span className="mono-discret sans-majuscules max-w-full whitespace-normal">
          {nbPoints === null
            ? `${nbManque} connexion${nbManque > 1 ? "s" : ""} manque${nbManque > 1 ? "nt" : ""} · travail automatique à vérifier${aVerifier}`
            : nbPoints === 0
              ? `Connexions et tâches suivies à jour${aVerifier}`
              : `${nbPoints} point${nbPoints > 1 ? "s" : ""} à traiter : ${detailPoints}${aVerifier}`}
        </span>
      </div>

      {/* ── Configuration ─────────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Connexions indispensables
          </h2>
          <span className="mono-discret">{configuration.filter((v) => v.estConnexion !== false).length}</span>
        </div>
        {/* La liste commune de la console (nuit du 25/09) : des rangs à filet
            et coins arrondis, comme l'ancienne « Santé du service ». */}
        <ul className="colonne-liste">
          {configuration.map((v) => (
            <li key={`${v.cle}:${v.usage}`} className="rang w-full flex-wrap items-start gap-y-1">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--encre)]">{v.usage}</span>
                {v.detail && (
                  <span className="mt-0.5 block text-sm text-[var(--texte-secondaire)]">
                    {v.detail}
                  </span>
                )}
                {v.etat !== "ok" && (
                  // La commande de la ligne : la variable et où la trouver, ou le geste quand ce n'est pas une variable (crédit IA).
                  <span className="mt-1.5 block text-sm text-[var(--encre)]">
                    {v.commande ?? (v.etat === "attention" && !v.absente
                      ? <>Posée. Pour passer en production : remplacer la valeur de <code className="rounded bg-[var(--filet-leger)] px-1 py-0.5 text-[12px]">{v.cle}</code> dans les variables d&apos;environnement du projet Vercel — valeur : {OU_OBTENIR[v.prestataire]}.</>
                      : <>À poser : <code className="rounded bg-[var(--filet-leger)] px-1 py-0.5 text-[12px]">{v.cle}</code> dans les variables d&apos;environnement du projet Vercel — valeur : {OU_OBTENIR[v.prestataire]}.</>)}
                  </span>
                )}
              </span>
              <span className={`puce ${PUCE_ETAT[v.etat].classe}`}>{PUCE_ETAT[v.etat].libelle}</span>
            </li>
          ))}
        </ul>
        <p className="mesure-lecture mt-3 text-sm text-muted-foreground">
          Gerimmo vérifie chaque connexion sans afficher de clé ni de donnée
          confidentielle. Aucun écran de Gerimmo ne pose une variable : elle se
          pose chez Vercel, puis le service est redéployé.
        </p>
      </section>

      {/* ── Tâches planifiées ─────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Travail automatique
          </h2>
          <Link href="/admin/journaux#historique-service" className="lien-discret text-sm">
            Voir l&apos;historique →
          </Link>
        </div>
        {taches === null ? (
          <div className="vide">
            L&apos;historique n&apos;a pas pu être lu : l&apos;état du travail automatique est
            inconnu. Rechargez la page.
          </div>
        ) : (
          <ul className="colonne-liste">
            {taches.map((t) => (
              <li key={t.nom} id={t.nom === "sauvegarde" ? "sauvegarde" : undefined} className="rang w-full flex-wrap items-start gap-y-2 scroll-mt-6">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-[var(--encre)]">{t.libelle}</span>
                    <span className="mono-discret sans-majuscules">Équipe {EQUIPES[t.equipe].nom} · {t.horaire}</span>
                  </span>
                  <span className="block text-sm text-[var(--texte-secondaire)]">{t.role}</span>
                  <span className="mt-0.5 block text-sm text-[var(--texte-secondaire)]">
                    {t.le ? (
                      <>
                        Dernière passe le{" "}
                        <time dateTime={t.le}>{formaterDateHeureParis(t.le)}</time> — {t.bilan}
                      </>
                    ) : (
                      "Aucun passage enregistré dans l’historique consulté (30 derniers jours pour le suivi des dossiers et la sauvegarde)."
                    )}
                  </span>
                  {/* La commande de la ligne (audit C5). */}
                  {(t.etat === "jamais" || t.etat === "echec" || t.etat === "retard") && (
                    <span className="mt-2 block">
                      {t.commandable ? (
                        cronPose ? <LancerMission mission={t.nom} /> : <span className="text-sm text-[var(--encre)]">« Lancer maintenant » sera possible une fois <code className="rounded bg-[var(--filet-leger)] px-1 py-0.5 text-[12px]">CRON_SECRET</code> posé (ci-dessus).</span>
                      ) : t.nom === "sauvegarde" ? (
                        <a href="https://github.com/GERIMMO/GERIMMO_V4/actions/workflows/sauvegarde.yml" target="_blank" rel="noreferrer" className="lien-discret text-sm">Relancer la sauvegarde depuis GitHub (Run workflow) →</a>
                      ) : (
                        <Link href="/admin/autonomie" className="lien-discret text-sm">Actualiser les prochaines étapes dans Développement du site →</Link>
                      )}
                    </span>
                  )}
                </span>
                <span className={`puce ${PUCE_TACHE[t.etat].classe}`}>{PUCE_TACHE[t.etat].libelle}</span>
              </li>
            ))}
          </ul>
        )}
        {/* Le cycle mensuel (D07) : tâche de la base de données, hors Vercel — lue à part, son dernier passage a plus de 30 jours d'âge. */}
        <ul className="colonne-liste mt-3">
          <li className="rang w-full flex-wrap items-start gap-y-2">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-[var(--encre)]">Cycle mensuel des loyers</span>
                <span className="mono-discret sans-majuscules">Équipe {EQUIPES.exploitation.nom} · le 1er de chaque mois, au matin</span>
              </span>
              <span className="block text-sm text-[var(--texte-secondaire)]">
                Génère les appels de loyer du mois et les quittances qui en découlent. Tâche de la base de données : elle ne se relance pas depuis cet écran.
              </span>
              {cycle === null ? (
                <span className="mt-0.5 block text-sm text-[var(--texte-secondaire)]">
                  Le dernier passage du cycle mensuel n’a pas pu être lu. Rechargez la page.
                </span>
              ) : (
                <>
                  <span className="mt-0.5 block text-sm text-[var(--texte-secondaire)]">
                    {cycle.le ? (
                      <>Dernière passe le <time dateTime={cycle.le}>{formaterDateHeureParis(cycle.le)}</time> — {cycle.bilan}</>
                    ) : (
                      "Aucun passage enregistré dans l’historique."
                    )}
                  </span>
                  {cycle.etat === "retard" && (
                    <span className="mt-2 block text-sm text-[var(--encre)]">
                      Aucun passage depuis {cycle.joursDepuis} jours (seuil : 32). Les appels de loyer ne sont plus générés automatiquement tant que la tâche ne repart pas.
                      Vérifier que la tâche planifiée « cycle-mensuel » existe dans la base de données et que les extensions <code className="rounded bg-[var(--filet-leger)] px-1 py-0.5 text-[12px]">pg_cron</code> et{" "}
                      <code className="rounded bg-[var(--filet-leger)] px-1 py-0.5 text-[12px]">pg_net</code> sont actives ; sinon la recréer en suivant la procédure de
                      reprise (<code className="rounded bg-[var(--filet-leger)] px-1 py-0.5 text-[12px]">app/docs/sauvegarde-et-restauration.md</code>). En attendant, « Générer l’échéancier » rattrape un bail à la fois (page du bail).
                    </span>
                  )}
                  {cycle.etat === "suspendu" && (
                    <span className="mt-2 block text-sm text-[var(--encre)]">
                      Un arrêt d’urgence couvre le cycle mensuel : il ne se lance pas tant que l’arrêt n’est pas levé.{" "}
                      <Link href="/admin/relais" className="lien-discret">Ouvrir « Relais et arrêts » →</Link>
                    </span>
                  )}
                </>
              )}
            </span>
            <span className={`puce ${PUCE_CYCLE[cycle?.etat ?? "jamais"].classe}`}>{cycle ? PUCE_CYCLE[cycle.etat].libelle : "à vérifier"}</span>
          </li>
        </ul>
        <p className="mesure-lecture mt-3 text-sm text-muted-foreground">
          Une pastille verte confirme un passage récent. Une pastille rouge
          demande une vérification. L&apos;historique est conservé pendant six mois.
          {" "}{NOTE_FUSEAU} <Link href="/admin/equipes" className="lien-discret">Pause et reprise des missions →</Link>
        </p>
        {/* IA-03 / D46 : dire vrai — cet écran se consulte, il n'avertit personne. D46-B (15/10) : trois envois d'alerte
            existent, et l'écran les nomme tous : le veto marketing, l'e-mail de 5 h et l'e-mail immédiat des urgences. */}
        <p className="mesure-lecture mt-1.5 text-sm text-muted-foreground">
          Cet écran ne prévient personne : une tâche en retard ou en échec s’y voit quand vous l’ouvrez, ou par le
          compteur « À décider » de la console. Gerimmo envoie trois e-mails d’alerte : le veto d’une publication
          marketing, au superviseur, avant sa parution ;{" "}
          {relais.configure
            ? `l’alerte quotidienne du relais, à 5 h (heure de Paris), qui signale aussi les tâches en échec ou absentes sur les dernières 24 h ; et l’e-mail immédiat des urgences du mode vacances, au plus ${DELAI_URGENCE_MAX_MINUTES} minutes après l’événement. Ces deux derniers partent vers ${relais.valides.length} adresse${relais.valides.length > 1 ? "s" : ""} : ${relais.valides.map(masquerAdresse).join(", ")}.`
            : "l’alerte quotidienne du relais, à 5 h (heure de Paris), et l’e-mail immédiat des urgences du mode vacances, qui ne partent pas : le relais n’est pas configuré, aucune tâche en échec n’est signalée par e-mail."}{" "}
          <Link href="/admin/relais#alerte-email" className="lien-discret">Alerte e-mail du relais →</Link>
        </p>
      </section>

      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Protection des fichiers
          </h2>
          <span className="puce puce-prep">antivirus à connecter</span>
        </div>
        <p className="mesure-lecture text-sm text-[var(--texte-secondaire)]">
          Gerimmo contrôle le format et la taille des pièces déposées. Leur accès
          reste réservé aux personnes autorisées. L&apos;analyse contre les virus
          n&apos;est pas encore disponible : le service dédié doit être relié et
          testé avant son activation.
        </p>
      </section>

      {/* ── Documents légaux ──────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Documents légaux
          </h2>
          <span className={`puce ${manquants.length > 0 ? "puce-rouge" : aCompleter.length > 0 ? "puce-prep" : "puce-loue"}`}>
            {manquants.length > 0
              ? `${manquants.length} à fournir`
              : aCompleter.length > 0
                ? `${aCompleter.length} à compléter, non bloquant`
                : "complets"}
          </span>
        </div>
        {manquants.length === 0 && aCompleter.length === 0 ? (
          <p className="text-sm text-[var(--texte-secondaire)]">
            L&apos;identité de l&apos;éditeur est complète : mentions légales,
            conditions et confidentialité sont publiables.
          </p>
        ) : (
          <div className="loc-carte text-sm">
            <p>
              {manquants.length > 0
                ? "Tant qu’un fait « manquant » n’est pas fourni, les pages légales affichent l’encadré « Document en cours de finalisation » et le paiement en ligne reste fermé."
                : "L’identité requise est complète : le paiement en ligne n’en dépend plus. Les faits « à compléter » s’affichent « à venir » sur les mentions légales, sans rien fermer."}
            </p>
            <ul className="mt-3 divide-y divide-[var(--filet)]">
              {faitsExiges.map((fait) => {
                const manque = manquants.includes(fait);
                return (
                  <li key={fait} className="flex items-center justify-between gap-3 py-2.5">
                    <span>{fait[0].toUpperCase() + fait.slice(1)}</span>
                    <span className={`puce ${manque ? "puce-rouge" : "puce-loue"}`}>
                      {manque ? "manquant" : "fourni"}
                    </span>
                  </li>
                );
              })}
              {faitsNonBloquants.map((fait) => {
                const manque = aCompleter.includes(fait);
                return (
                  <li key={fait} className="flex items-center justify-between gap-3 py-2.5">
                    <span>{fait[0].toUpperCase() + fait.slice(1)}</span>
                    <span className={`puce ${manque ? "puce-prep" : "puce-loue"}`}>
                      {manque ? "à compléter, non bloquant" : "fourni"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm text-[var(--encre)]">
              Ils se saisissent dans les{" "}
              <Link href="/admin/parametres" className="lien-texte">paramètres généraux</Link>, puis sont repris
              sans déploiement par les trois pages publiques.
            </p>
            <p className="mt-1.5">
              <Link href="/mentions-legales" className="lien-discret text-sm">
                Voir la page publique →
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* ── Envois automatiques ───────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Envois automatiques
          </h2>
          <span className="mono-discret">
            {adoption ? `${adoption.vivantes} organisation${adoption.vivantes > 1 ? "s" : ""} active${adoption.vivantes > 1 ? "s" : ""} ou en essai` : "—"}
          </span>
        </div>
        {adoption === null ? (
          <div className="vide">Les organisations n&apos;ont pas pu être lues.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ["Avis d'échéance", adoption.appels],
              ["Quittances", adoption.quittances],
              ["Relances de loyers", adoption.relances],
              ["Tout à la main", adoption.toutManuel],
            ].map(([libelle, n]) => (
              <div key={String(libelle)} className={`kpi ${libelle === "Tout à la main" && Number(n) > 0 ? "ambre" : "bleu"}`}>
                <span className="libelle-champ">{libelle}</span>
                <div className="chiffre montant">{n}</div>
                <span className="mono-discret sans-majuscules">
                  sur {adoption.vivantes}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mesure-lecture mt-3 text-sm text-muted-foreground">
          Chaque organisation active ses envois dans son profil ; l&apos;assistant
          et le parcours de démarrage le lui proposent. Une organisation « tout à
          la main » clique là où Gerimmo pourrait faire seul.
          {/* La commande de la section (audit C36) : les organisations, pas un chiffre seul. */}
          {" "}<Link href="/admin/clients" className="lien-discret">Voir les organisations →</Link>
        </p>
      </section>
    <SuiviStripe controle={controleStripe.error ? null : controleStripe.data as ControleStripe}/><BudgetSignatures budget={budgetSignature.error ? null : budgetSignature.data as BudgetSignature} ouverture={ouverture}/></main>
  );
}
