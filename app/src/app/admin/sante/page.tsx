import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { faitsManquants } from "@/lib/editeur";
import {
  adoptionAutomatique,
  chargerSante,
  type Etat,
  type EtatTache,
  type OrganisationPourAdoption,
} from "@/lib/sante-service";

export const metadata = { title: "Santé du service — Gerimmo" };

// Ce qui est posé, ce qui tourne, ce qui manque — sur un seul écran.
//
// Né de la préparation du lancement (20/09) : la tâche des abonnements
// n'avait jamais tourné en production, faute de Stripe, et rien ne le disait.
// Cet écran se lit chaque matin la première semaine, puis quand un doute
// naît. Il ne montre JAMAIS une valeur d'environnement : la présence d'un
// secret est une information, le secret n'en est pas une ici.

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
};

export default async function PageSante() {
  const supabase = await createClient();
  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  const manquants = faitsManquants();
  // Le même calcul que /admin et /admin/brief (25/09) : une seule requête du
  // journal, une seule fenêtre, un seul chiffre.
  const [sante, orgs] = await Promise.all([
    chargerSante(supabase, process.env, manquants.length),
    supabase
      .from("organizations")
      .select("status, quittances_envoi_auto, appels_envoi_auto, relances_envoi_auto"),
  ]);

  const { configuration, taches } = sante;
  const adoption = orgs.error
    ? null
    : adoptionAutomatique((orgs.data ?? []) as OrganisationPourAdoption[]);

  const nbManque = configuration.filter((v) => v.etat === "manque").length;
  const nbAttention = configuration.filter((v) => v.etat === "attention").length;
  const nbPoints = taches === null ? null : sante.bloquants;
  // Le total se détaille (24/09) : « 20 points à traiter · 10 connexions
  // manquantes » ne disait pas d'où venaient les dix autres, et « 1 à
  // vérifier » ne comptait pas dans les vingt. Même décompte que
  // pointsBloquants (lib/sante-service.ts).
  const nbJamais = taches?.filter((t) => t.etat === "jamais").length ?? 0;
  const nbEchec = taches?.filter((t) => t.etat === "echec").length ?? 0;
  const nbNonConfigurees = taches?.filter((t) => t.etat === "non_configuree").length ?? 0;
  const detailPoints = [
    nbManque > 0 && `${nbManque} connexion${nbManque > 1 ? "s" : ""} manquante${nbManque > 1 ? "s" : ""}`,
    nbJamais > 0 && `${nbJamais} tâche${nbJamais > 1 ? "s" : ""} jamais exécutée${nbJamais > 1 ? "s" : ""}`,
    nbEchec > 0 && `${nbEchec} tâche${nbEchec > 1 ? "s" : ""} en échec`,
    manquants.length > 0 && "documents légaux incomplets",
  ].filter(Boolean).join(", ");
  const aVerifier = [
    nbAttention > 0 && `${nbAttention} connexion${nbAttention > 1 ? "s" : ""} à vérifier`,
    nbNonConfigurees > 0 && `${nbNonConfigurees} tâche${nbNonConfigurees > 1 ? "s" : ""} sans service relié`,
  ].filter(Boolean).map((x) => ` · ${x}`).join("");
  // Les huit faits exigés, fournis ou non : `faitsManquants({})` les rend
  // tous, dans l'ordre de lib/editeur.ts.
  const faitsExiges = faitsManquants({});

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      {/* Un seul en-tête, sans fil d'Ariane (24/09) : il répétait le
          bandeau et l'onglet allumé. */}
      <div className="entete-page mb-6">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h1>Santé du service</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Les services reliés à Gerimmo, le travail réalisé automatiquement et
            les points qui demandent votre attention.
          </p>
        </div>
        <span className="mono-discret sans-majuscules max-w-full whitespace-normal">
          {nbPoints === null
            ? `${nbManque} connexion${nbManque > 1 ? "s" : ""} manque${nbManque > 1 ? "nt" : ""} · travail automatique à vérifier${aVerifier}`
            : nbPoints === 0
              ? `Service prêt${aVerifier}`
              : `${nbPoints} point${nbPoints > 1 ? "s" : ""} à traiter : ${detailPoints}${aVerifier}`}
        </span>
      </div>

      {/* ── Configuration ─────────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Connexions indispensables
          </h2>
          <span className="mono-discret">{configuration.length}</span>
        </div>
        <ul className="divide-y divide-[var(--filet)] border border-[var(--filet)] bg-[var(--ivoire)]">
          {configuration.map((v) => (
            <li key={v.cle} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[13.5px] text-[var(--encre)]">{v.usage}</span>
                {v.detail && (
                  <span className="mt-0.5 block text-[12.5px] text-[var(--texte-secondaire)]">
                    {v.detail}
                  </span>
                )}
              </span>
              <span className={`puce ${PUCE_ETAT[v.etat].classe}`}>{PUCE_ETAT[v.etat].libelle}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Gerimmo vérifie chaque connexion sans afficher de clé ni de donnée
          confidentielle. Lorsqu&apos;une connexion manque, raccordez le service concerné
          avant d&apos;activer la fonction.
        </p>
      </section>

      {/* ── Tâches planifiées ─────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Travail automatique
          </h2>
          <Link href="/admin/journaux#historique-service" className="lien-discret text-[12.5px]">
            Voir l&apos;historique →
          </Link>
        </div>
        {taches === null ? (
          <div className="vide">
            L&apos;historique n&apos;a pas pu être lu : l&apos;état du travail automatique est
            inconnu. Rechargez la page.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--filet)] border border-[var(--filet)] bg-[var(--ivoire)]">
            {taches.map((t) => (
              <li key={t.nom} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-3.5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-[13.5px] text-[var(--encre)]">{t.libelle}</span>
                    <span className="mono-discret sans-majuscules">{t.horaire}</span>
                  </span>
                  <span className="block text-[13px] text-[var(--texte-secondaire)]">{t.role}</span>
                  <span className="mt-0.5 block text-[12.5px] text-[var(--texte-secondaire)]">
                    {t.le ? (
                      <>
                        Dernière passe le{" "}
                        <time dateTime={t.le}>{formaterDateHeureParis(t.le)}</time> — {t.bilan}
                      </>
                    ) : (
                      "Gerimmo n’a encore enregistré aucun passage."
                    )}
                  </span>
                </span>
                <span className={`puce ${PUCE_TACHE[t.etat].classe}`}>{PUCE_TACHE[t.etat].libelle}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Une pastille verte confirme un passage récent. Une pastille rouge
          demande une vérification. L&apos;historique est conservé pendant six mois.
          {" "}{NOTE_FUSEAU}
        </p>
      </section>

      {/* ── Documents légaux ──────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Documents légaux
          </h2>
          <span className={`puce ${manquants.length === 0 ? "puce-loue" : "puce-rouge"}`}>
            {manquants.length === 0 ? "complets" : `${manquants.length} à fournir`}
          </span>
        </div>
        {manquants.length === 0 ? (
          <p className="text-sm text-[var(--texte-secondaire)]">
            L&apos;identité de l&apos;éditeur est complète : mentions légales,
            conditions et confidentialité sont publiables.
          </p>
        ) : (
          // Où et comment compléter (24/09) : la phrase énumérait huit faits
          // et demandait de les « transmettre une seule fois », sans dire où.
          // Ils sont des constantes de lib/editeur.ts : aucun formulaire ne
          // les saisit.
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-3.5 text-sm">
            <p>
              Les mentions légales, les conditions et la page confidentialité
              affichent « information à fournir » tant qu&apos;un de ces faits
              manque.
            </p>
            <ul className="mt-3 divide-y divide-[var(--filet)]">
              {faitsExiges.map((fait) => {
                const manque = manquants.includes(fait);
                return (
                  <li key={fait} className="flex items-center justify-between gap-3 py-1.5">
                    <span>{fait[0].toUpperCase() + fait.slice(1)}</span>
                    <span className={`puce ${manque ? "puce-rouge" : "puce-loue"}`}>
                      {manque ? "manquant" : "fourni"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12.5px] text-[var(--texte-secondaire)]">
              Préparez les informations exactes de votre entreprise pour
              finaliser ces documents avant l&apos;ouverture commerciale.
              Leur mise à jour sera reprise sur les trois pages publiques.
            </p>
            <p className="mt-1.5">
              <Link href="/mentions-legales" className="lien-discret text-[12.5px]">
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
            {/* « Vivantes » était un mot interne (24/09) : la console dit
                « active » et « en essai ». */}
            {adoption ? `${adoption.vivantes} organisation${adoption.vivantes > 1 ? "s" : ""} active${adoption.vivantes > 1 ? "s" : ""} ou en essai` : "—"}
          </span>
        </div>
        {adoption === null ? (
          <div className="vide">Les organisations n&apos;ont pas pu être lues.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Avis d'échéance", adoption.appels],
              ["Quittances", adoption.quittances],
              ["Relances d'impayé", adoption.relances],
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
        <p className="mt-2 text-xs text-muted-foreground">
          Chaque organisation active ses envois dans son profil ; l&apos;assistant
          et le parcours de démarrage le lui proposent. Une organisation « tout à
          la main » clique là où Gerimmo pourrait faire seul.
        </p>
      </section>
    </main>
  );
}
