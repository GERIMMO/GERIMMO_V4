import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dernieresTaches, type PasseConsignee } from "@/lib/tache";
import { formaterDateHeure } from "@/lib/ged";
import { faitsManquants } from "@/lib/editeur";
import {
  adoptionAutomatique,
  etatConfiguration,
  etatTaches,
  pointsBloquants,
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
};

export default async function PageSante() {
  const supabase = await createClient();
  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  const [journal, orgs] = await Promise.all([
    supabase
      .from("tech_log")
      .select("evenement, details, created_at")
      .like("evenement", "tache_%")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("organizations")
      .select("status, quittances_envoi_auto, appels_envoi_auto, relances_envoi_auto"),
  ]);

  const configuration = etatConfiguration(process.env);
  const taches = journal.error
    ? null
    : etatTaches(dernieresTaches((journal.data ?? []) as PasseConsignee[]), new Date());
  const adoption = orgs.error
    ? null
    : adoptionAutomatique((orgs.data ?? []) as OrganisationPourAdoption[]);
  const manquants = faitsManquants();

  const nbManque = configuration.filter((v) => v.etat === "manque").length;
  const nbAttention = configuration.filter((v) => v.etat === "attention").length;
  const nbPoints = taches === null ? null : pointsBloquants(configuration, taches, manquants.length);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin" className="text-[var(--bleu)] hover:underline">
            Console d&apos;administration
          </Link>{" "}
          / Santé du service
        </p>
        <div className="entete-page">
          <h1>Santé du service</h1>
          <span className="mono-discret">
            {nbPoints === null
              ? `${nbManque} connexion${nbManque > 1 ? "s" : ""} manque${nbManque > 1 ? "nt" : ""} · travail automatique à vérifier`
              : nbPoints === 0
                ? "Service prêt"
                : `${nbPoints} point${nbPoints > 1 ? "s" : ""} à traiter · ${nbManque} connexion${nbManque > 1 ? "s" : ""} manquante${nbManque > 1 ? "s" : ""}${nbAttention ? ` · ${nbAttention} à vérifier` : ""}`}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Les services reliés à Gerimmo, le travail réalisé automatiquement et
          les points qui demandent votre attention.
        </p>
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
          confidentielle. Lorsqu&apos;une ligne manque, raccordez le service concerné
          avant d&apos;activer la fonction.
        </p>
      </section>

      {/* ── Tâches planifiées ─────────────────────────────────────────── */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Travail automatique
          </h2>
          <Link href="/admin/journaux" className="lien-discret text-[12.5px]">
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
                    <span className="font-heading text-[15px] text-[var(--encre)]">{t.libelle}</span>
                    <span className="mono-discret sans-majuscules">{t.horaire}</span>
                  </span>
                  <span className="block text-[13px] text-[var(--texte-secondaire)]">{t.role}</span>
                  <span className="mt-0.5 block text-[12.5px] text-[var(--texte-secondaire)]">
                    {t.le ? (
                      <>
                        Dernière passe le{" "}
                        <time dateTime={t.le}>{formaterDateHeure(t.le)}</time> — {t.bilan}
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
          Une ligne verte confirme un passage récent. Une ligne rouge demande
          une vérification. L&apos;historique est conservé pendant six mois.
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
          <div className="border border-[var(--filet)] bg-[var(--ivoire)] p-3.5 text-sm">
            <p>
              Les mentions légales, les conditions et la page confidentialité
              affichent « information à fournir » tant qu&apos;il manque :{" "}
              {manquants.join(", ")}.
            </p>
            <p className="mt-1.5 text-[12.5px] text-[var(--texte-secondaire)]">
              Transmettez ces informations une seule fois : Gerimmo les reprendra
              automatiquement sur les trois pages publiques.{" "}
              <Link href="/mentions-legales" className="lien-discret">
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
            {adoption ? `${adoption.vivantes} organisation${adoption.vivantes > 1 ? "s" : ""} vivante${adoption.vivantes > 1 ? "s" : ""}` : "—"}
          </span>
        </div>
        {adoption === null ? (
          <div className="vide">Les organisations n&apos;ont pas pu être lues.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Avis d'échéance", adoption.appels],
              ["Quittances", adoption.quittances],
              ["Relances d'impayé", adoption.relances],
              ["Tout à la main", adoption.toutManuel],
            ].map(([libelle, n]) => (
              <div key={String(libelle)} className={`kpi ${libelle === "Tout à la main" && Number(n) > 0 ? "ambre" : "bleu"}`}>
                <span className="libelle-champ">{libelle}</span>
                <div className="chiffre montant">{n}</div>
                <span className="mono-discret sans-majuscules !text-[10px]">
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
