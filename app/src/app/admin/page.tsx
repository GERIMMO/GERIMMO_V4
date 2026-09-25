import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { familleOrganisation } from "@/lib/clients-supervision";
import { faitsManquants } from "@/lib/editeur";
import { chargerSante } from "@/lib/sante-service";
import { MesureAutonomie } from "@/components/mesure-autonomie";

// « Supervision » partout : la barre, le titre et l'onglet (24/09).
export const metadata = { title: "Supervision — Gerimmo" };

// Indicateurs et files de décisions de la supervision.

type Organisation = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  essai_fin: string | null;
};

function Indicateur({
  libelle,
  valeur,
  precision,
  accent,
  href,
}: {
  libelle: string;
  valeur: string | number;
  precision?: string;
  accent?: "or" | "vert" | "rouge" | "bleu" | "ambre";
  href?: string;
}) {
  const contenu = (
    <>
      <span className="libelle-champ">{libelle}</span>
      <div className="chiffre montant">{valeur}</div>
      {precision && (
        <span className="mono-discret sans-majuscules">{precision}</span>
      )}
    </>
  );
  const classe = `kpi ${accent ?? ""}`;
  return href ? (
    <Link href={href} className={classe}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

// Une seule pastille pour « rien n'attend » (24/09) : grise, « À jour », sur
// les cartes d'équipe comme sur les files. Le vert reste réservé à un
// résultat positif prouvé.
const PASTILLE_A_JOUR = "puce-grise";

function File({
  titre,
  compte,
  explication,
  href,
  action,
}: {
  titre: string;
  compte: number | null;
  explication: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 transition-colors hover:bg-[var(--survol)]"
    >
      <span
        aria-hidden
        className={`mt-0.5 w-[3px] shrink-0 self-stretch ${
          (compte ?? 0) > 0 ? "bg-[var(--or)]" : "bg-[var(--filet)]"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-heading text-[16px] text-[var(--encre)]">{titre}</span>
          <span className={`puce ${(compte ?? 0) > 0 ? "puce-prep" : PASTILLE_A_JOUR}`}>
            {compte === null ? "Indisponible" : compte === 0 ? "À jour" : `${compte} en attente`}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
          {explication}
        </span>
        <span className="lien-discret mt-1.5 inline-block text-[12.5px] group-hover:underline">
          {action} →
        </span>
      </span>
    </Link>
  );
}

function Equipe({ nom, etat, travail, prochaine, resultat, autorisation, href, libelleLien }: {
  nom: string;
  // « Suivi courant » : pas d'indicateur chiffré derrière — la pastille reste
  // neutre plutôt que d'alerter en permanence.
  etat: "À jour" | "À surveiller" | "Action attendue" | "Suivi courant" | "Indisponible";
  travail: string;
  prochaine: string;
  resultat: string;
  autorisation: string;
  href: string;
  // La destination n'est jamais une « page d'équipe » : le lien la nomme
  // (24/09), « Ouvrir l'équipe » menait à Santé, Journaux ou Inscriptions.
  libelleLien: string;
}) {
  const classe =
    etat === "À jour"
      ? PASTILLE_A_JOUR
      : etat === "Action attendue"
        ? "puce-rouge"
        : etat === "Suivi courant"
          ? "puce-grise"
          : "puce-prep";
  return (
    <Link href={href} className="group rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 transition hover:-translate-y-0.5 hover:bg-[var(--survol)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-[16px] text-[var(--encre)]">{nom}</h3>
        <span className={`puce ${classe}`}>{etat}</span>
      </div>
      <dl className="mt-3 space-y-2 text-[12.5px] leading-relaxed">
        <div><dt className="inline font-semibold text-[var(--encre)]">Mission : </dt><dd className="inline text-[var(--texte-secondaire)]">{travail}</dd></div>
        <div><dt className="inline font-semibold text-[var(--encre)]">Prochaine action : </dt><dd className="inline text-[var(--texte-secondaire)]">{prochaine}</dd></div>
        <div><dt className="inline font-semibold text-[var(--encre)]">Résultat : </dt><dd className="inline text-[var(--texte-secondaire)]">{resultat}</dd></div>
        <div><dt className="inline font-semibold text-[var(--encre)]">Votre décision : </dt><dd className="inline text-[var(--texte-secondaire)]">{autorisation}</dd></div>
      </dl>
      <span className="lien-discret mt-3 inline-block text-[12.5px] group-hover:underline">{libelleLien} →</span>
    </Link>
  );
}

export default async function PageAdmin() {
  const supabase = await createClient();

  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  // On lit `error` : une console de pilotage qui affiche zéro parce qu'une
  // requête a échoué est pire que pas de console du tout.
  const [orgs, devis, publications, lots, artisans, retours, contestations, sante, incidentsOuverts] = await Promise.all([
    supabase.from("organizations").select("id, name, status, type, essai_fin").order("name"),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("publications").select("id, statut"),
    supabase.from("lots").select("id", { count: "exact", head: true }).neq("etat", "archive"),
    supabase.rpc("artisans_a_valider"),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).in("etat", ["nouveau", "en_examen", "en_cours"]).neq("nature", "contestation"),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "contestation").neq("etat", "resolu"),
    // Le même calcul que /admin/sante et /admin/brief (25/09) : les trois pages
    // comptaient les « points bloquants » chacune avec sa fenêtre.
    chargerSante(supabase, process.env, faitsManquants().length),
    supabase.from("incidents").select("id", { count: "exact", head: true }).is("clos_le", null),
  ]);

  // La santé du service, en une ligne (20/09) : une variable absente ou une
  // tâche qui n'a jamais tourné ne se voit pas d'ici, et c'est ici qu'on
  // regarde. Le détail vit sur /admin/sante ; la supervision dit seulement
  // combien de points bloquent, et se tait quand tout est en place.
  const taches = sante.taches;
  const bloquants = sante.bloquants;
  // La carte finance porte un chiffre de SON domaine (24/09) : les envois
  // d'argent en échec. Les « points bloquants » (connexions, tâches jamais
  // exécutées, mentions légales) ne relèvent pas d'elle et vivent dans le
  // bandeau, seul à les compter.
  const TACHES_FINANCE = ["quittances", "appels", "relances", "abonnements"];
  const envoisEnEchec =
    taches === null ? null : taches.filter((t) => TACHES_FINANCE.includes(t.nom) && t.etat === "echec").length;

  const enEchec = [sante.tachesIllisibles, incidentsOuverts.error, orgs.error, devis.error, publications.error, lots.error, artisans.error, retours.error, contestations.error].filter(Boolean);
  const organisations = (orgs.data ?? []) as Organisation[];
  const parStatut = (s: string) => organisations.filter((o) => o.status === s).length;
  const agences = organisations.filter((o) => familleOrganisation(o.type) === "agence").length;
  const proprietairesDirects = organisations.length - agences;
  const aEcrire = (publications.data ?? []).filter(
    (p) => p.statut === "proposition" || p.statut === "brouillon"
  ).length;
  const nbRetours = retours.error ? null : retours.count ?? 0;
  const nbArtisans = artisans.error ? null : (artisans.data ?? []).length;
  const nbIncidents = incidentsOuverts.error ? null : incidentsOuverts.count ?? 0;
  const suspendues = parStatut("suspendue");

  // Les files de décision. Une file vide n'a plus droit à une grande carte
  // (24/09) : cinq cartes « À jour » occupaient 640 px pour ne rien dire.
  const files = [
    {
      titre: "Inscriptions artisan",
      compte: artisans.error ? null : (artisans.data ?? []).length,
      explication: "Vérifiez le SIRET et les justificatifs, puis validez ou refusez l’inscription avec un motif.",
      href: "/admin/artisans",
      action: "Examiner les inscriptions",
    },
    {
      titre: "Demandes de devis",
      compte: devis.error ? null : devis.count ?? 0,
      explication: "Demandes commerciales reçues depuis le site : consultez le besoin de l’agence et préparez votre réponse.",
      href: "/admin/devis",
      action: "Traiter les demandes",
    },
    {
      titre: "Retours et idées",
      compte: retours.error ? null : retours.count ?? 0,
      explication: "Qualifiez les problèmes, répondez aux utilisateurs et examinez les idées lors de la revue mensuelle.",
      href: "/admin/retours",
      action: "Ouvrir le suivi",
    },
    {
      titre: "Contestations artisan",
      compte: contestations.error ? null : contestations.count ?? 0,
      explication: "Examinez les demandes de révision dans un suivi privé entre l’artisan et la supervision.",
      href: "/admin/retours?nature=contestation",
      action: "Examiner les contestations",
    },
    {
      titre: "Articles du journal",
      compte: publications.error ? null : aEcrire,
      explication: "Sujets proposés par le calendrier du métier, à compléter et publier. Un article ne paraît pas tant qu'un fait daté manque.",
      href: "/admin/publications",
      action: "Ouvrir les articles",
    },
  ];
  const filesOuvertes = files.filter((f) => f.compte !== 0);
  const filesAJour = files.filter((f) => f.compte === 0);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Supervision</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-discret">
            {orgs.error ? "Organisations indisponibles" : `${organisations.length} organisation${organisations.length > 1 ? "s" : ""}`}
          </span>
          {/* Le geste le plus commercial du produit : il n'existait pas, et
              l'ouverture d'une agence se faisait en SQL. */}
          <Link href="/admin/organisations/nouvelle" className="btn-or">
            Ouvrir une organisation
          </Link>
        </div>
      </div>

      {/* L'échec de lecture se dit AVANT les cartes : lu après, il arrivait
          une fois les chiffres incomplets déjà pris pour argent comptant. */}
      {enEchec.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-[13px] text-[var(--destructive-soft-foreground)]"
        >
          {enEchec.length} lecture{enEchec.length > 1 ? "s" : ""} de cette page
          {enEchec.length > 1 ? " ont" : " a"} échoué : les chiffres ci-dessous sont
          incomplets. Rechargez — s&apos;ils ne reviennent pas, c&apos;est la base qui
          ne répond pas.
        </div>
      )}

      {/* Le signal le plus grave de la page monte sous le titre (24/09) : il
          arrivait après les sept cartes d'équipes, à 2,4 écrans du haut. Sur
          téléphone, le lien passe sous la phrase au lieu de l'écraser. */}
      {bloquants > 0 && (
        <Link
          href="/admin/sante"
          className="mb-6 flex flex-col gap-2 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-3.5 text-[13px] text-[var(--warning-soft-foreground)] hover:underline sm:flex-row sm:items-start sm:gap-3"
        >
          <span className="min-w-0 flex-1">
            <b className="font-semibold">Le service n&apos;est pas prêt</b> : {bloquants} point
            {bloquants > 1 ? "s" : ""} bloque{bloquants > 1 ? "nt" : ""} — connexion absente,
            travail automatique non exécuté ou document légal incomplet.
          </span>
          <span className="shrink-0 font-semibold">Santé du service →</span>
        </Link>
      )}

      <Link href="/admin/brief" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 text-sm text-[var(--encre)] hover:bg-[var(--survol)]">
        <span><b>Aujourd’hui</b><span className="ml-2 text-[var(--texte-secondaire)]">Priorités, signaux utilisateurs et ordre de croissance.</span></span>
        <span className="lien-discret shrink-0">Ouvrir →</span>
      </Link>

      <MesureAutonomie titre="Ce que Gerimmo automatise, toutes organisations" />

      {/* « Dossiers et évolutions » : le nom de l'entrée de barre, de la page et de
          cette section (24/09). « Centre de commandement » et « Vos équipes
          Gerimmo » en étaient deux autres. */}
      <section className="section-ecran">
        <div className="entete-carte mb-4">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Dossiers et évolutions</h2>
          <Link href="/admin/autonomie" className="lien-discret text-[12.5px]">
            7 équipes spécialisées →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Equipe nom="Agent exploitation locative" etat="Suivi courant" travail={`${organisations.length} organisation${organisations.length > 1 ? "s" : ""} et ${lots.count ?? 0} lot${(lots.count ?? 0) > 1 ? "s" : ""} suivis.`} prochaine="Traiter les échéances et dossiers incomplets." resultat="Baux, loyers et documents regroupés par client." autorisation="Les décisions attendues sont présentées dans le dossier concerné." href="/admin/equipes" libelleLien="Commander les équipes" />
          <Equipe nom="Agent incidents et artisans" etat={incidentsOuverts.error || artisans.error ? "Indisponible" : (nbIncidents ?? 0) + (nbArtisans ?? 0) > 0 ? "À surveiller" : "À jour"} travail={`${nbIncidents ?? "—"} incident${nbIncidents === 1 ? "" : "s"} ouvert${nbIncidents === 1 ? "" : "s"}.`} prochaine="Qualifier les urgences et trouver l’artisan adapté." resultat={`${nbArtisans ?? "—"} inscription${nbArtisans === 1 ? "" : "s"} artisan à examiner.`} autorisation="Validation des nouveaux artisans uniquement." href="/admin/artisans" libelleLien="Examiner les inscriptions" />
          <Equipe nom="Agent finance et fiscalité" etat={envoisEnEchec === null ? "Indisponible" : envoisEnEchec !== null && envoisEnEchec > 0 ? "Action attendue" : "Suivi courant"} travail="Paiements, quittances, relances et abonnements contrôlés." prochaine="Reprendre les envois ou paiements signalés en échec." resultat={envoisEnEchec === null ? "Envois automatiques momentanément illisibles." : envoisEnEchec > 0 ? `${envoisEnEchec} envoi${envoisEnEchec > 1 ? "s" : ""} automatique${envoisEnEchec > 1 ? "s" : ""} en échec (quittances, avis, relances ou abonnements).` : "Aucun envoi de quittance, d’avis, de relance ou d’abonnement en échec."} autorisation="Les paiements et changements de prix restent soumis à votre accord." href="/admin/sante" libelleLien="Voir la santé du service" />
          <Equipe nom="Agent conformité et documents" etat={faitsManquants().length > 0 ? "Action attendue" : "À jour"} travail="Documents, accès et durées de conservation surveillés." prochaine="Compléter les informations légales manquantes." resultat={`${faitsManquants().length} information${faitsManquants().length > 1 ? "s" : ""} légale${faitsManquants().length > 1 ? "s" : ""} à fournir.`} autorisation="Suppression définitive et publication légale sous votre contrôle." href="/admin/journaux" libelleLien="Voir les journaux" />
          <Equipe nom="Agent qualité et corrections" etat={retours.error ? "Indisponible" : (nbRetours ?? 0) > 0 ? "À surveiller" : "À jour"} travail="Retours utilisateurs et problèmes regroupés par priorité." prochaine="Corriger d’abord les problèmes qui bloquent un utilisateur." resultat={`${nbRetours ?? "—"} retour${nbRetours === 1 ? "" : "s"} ouvert${nbRetours === 1 ? "" : "s"}.`} autorisation="Une modification sensible vous est présentée avant publication." href="/admin/autonomie#ameliorations" libelleLien="Voir les améliorations" />
          <Equipe nom="Agent marketing" etat={publications.error ? "Indisponible" : aEcrire > 0 ? "À surveiller" : "À jour"} travail="Contenus et publications Facebook préparés selon le calendrier." prochaine="Relire les contenus qui attendent une décision." resultat={`${aEcrire} contenu${aEcrire > 1 ? "s" : ""} à traiter.`} autorisation="La publicité payante n’est pas ouverte ; le seuil d’alerte surveille les dépenses Meta constatées." href="/admin/marketing" libelleLien="Ouvrir le marketing" />
          <Equipe nom="Agent développement territorial" etat="Suivi courant" travail="Présence actuelle et départements voisins comparés." prochaine="Compléter les données de marché avant une ouverture." resultat="Le prochain territoire est classé avec les données disponibles." autorisation="Toute ouverture de département vous est proposée avant activation." href="/admin/territoire" libelleLien="Ouvrir le territoire" />
        </div>
      </section>

      {/* Indicateurs — wiki/personas/Super Admin.md : agences par statut,
          lots gérés (base de facturation), volumes. La rangée dit enfin ce
          qu'elle compte (24/09), chaque tuile mène à la liste des clients, et
          la couleur suit la valeur : « Suspendues 0 » n'est plus rouge. */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Organisations</h2>
          <span className="mono-discret">par statut d&apos;abonnement</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Actives" valeur={orgs.error ? "—" : parStatut("active")} accent="vert"
            precision="abonnement en cours" href="/admin/clients" />
          <Indicateur libelle="En essai" valeur={orgs.error ? "—" : parStatut("essai")} accent="ambre"
            precision="14 jours, sans carte" href="/admin/clients" />
          <Indicateur libelle="Suspendues" valeur={orgs.error ? "—" : suspendues} accent={!orgs.error && suspendues > 0 ? "rouge" : undefined}
            precision="lecture seule, export ouvert" href="/admin/clients" />
          <Indicateur libelle="Lots gérés" valeur={lots.error ? "—" : lots.count ?? 0} accent="bleu"
            precision="base de facturation" href="/admin/clients" />
        </div>
      </section>

      {/* Files d'attente RÉELLES */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
            Ce qui attend une décision
          </h2>
        </div>
        {filesOuvertes.length === 0 ? (
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4">
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--encre)]">
              <b>Rien n&apos;attend de décision.</b>
              <span className={`puce ${PASTILLE_A_JOUR}`}>À jour</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
              {files.map((f) => (
                <Link key={f.href} href={f.href} className="lien-discret">
                  {f.titre} →
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {filesOuvertes.map((f) => (
                <File key={f.href} {...f} />
              ))}
            </div>
            {filesAJour.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--texte-secondaire)]">
                <span>À jour :</span>
                {filesAJour.map((f) => (
                  <Link key={f.href} href={f.href} className="lien-discret">
                    {f.titre} →
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* LES CLIENTS ONT LEUR ÉCRAN (19/09) : la liste complète vivait ici, à
          plat, agences et propriétaires mêlés et les artisans absents. Deux
          listes divergentes valent moins qu'une : celle-ci renvoie à l'autre,
          en disant seulement combien ils sont. */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Clients</h2>
          <span className="mono-discret">{orgs.error ? "—" : organisations.length}</span>
        </div>
        {orgs.error ? (
          <p>La liste des clients est indisponible. Rechargez la page pour la consulter.</p>
        ) : (
          <Link
            href="/admin/clients"
            className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 transition-colors hover:bg-[var(--survol)]"
          >
            <span className="min-w-0">
              <span className="block font-heading text-[16px] text-[var(--encre)]">
                {agences} agence{agences > 1 ? "s" : ""} · {proprietairesDirects} propriétaire
                {proprietairesDirects > 1 ? "s" : ""} bailleur
                {proprietairesDirects > 1 ? "s" : ""}
                {artisans.error ? "" : ` · ${(artisans.data ?? []).length} artisan${(artisans.data ?? []).length > 1 ? "s" : ""} en attente`}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
                Les trois familles, leurs fiches, et l&apos;entrée dans leur
                espace.
              </span>
            </span>
            <span className="lien-discret shrink-0 text-[12.5px] group-hover:underline">
              Ouvrir →
            </span>
          </Link>
        )}
      </section>
    </main>
  );
}
