import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { faitsManquants } from "@/lib/editeur";
import { etatConfiguration, etatTaches, pointsBloquants } from "@/lib/sante-service";
import { dernieresTaches, type PasseConsignee } from "@/lib/tache";
import { BoutonBriefIA } from "./bouton-ia";
import { OuvrirAlertes } from "./ouvrir-alertes";

export const metadata = { title: "Aujourd’hui — Gerimmo" };

type Signal = { titre: string; detail: string; href?: string; action: string; niveau: "urgent" | "attention" | "suivi" };

function nombre(resultat: { count: number | null; error: unknown }) {
  return resultat.error ? null : resultat.count ?? 0;
}

export default async function PageBrief() {
  // L'accès super admin est contrôlé par le layout. Chaque lecture conserve son
  // état d'erreur : une source indisponible ne devient jamais un faux zéro.
  const supabase = await createClient();
  const [bugsN1, bugs, idees, devis, brouillons, comptes, taches, alertesCritiques, artisans, evolutions, veille, missions] = await Promise.all([
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").eq("gravite", "N1").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "idee").in("etat", ["nouveau", "en_examen"]),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("publications").select("id", { count: "exact", head: true }).in("statut", ["proposition", "brouillon"]),
    supabase.from("organizations").select("id", { count: "exact", head: true }).in("status", ["active", "essai"]),
    supabase.from("tech_log").select("evenement, details, created_at").like("evenement", "tache_%").order("created_at", { ascending: false }).limit(200),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("statut", "ouverte").eq("criticite", "critique"),
    supabase.rpc("artisans_a_valider"),
    supabase.from("development_proposals").select("id", { count: "exact", head: true }).eq("statut", "autorisation"),
    supabase.from("regulatory_watch").select("id", { count: "exact", head: true }).eq("statut", "a_examiner").not("analyse_le", "is", null),
    supabase.from("agent_passages").select("mission,etat,debut").order("debut", { ascending: false }).limit(200),
  ]);

  const configuration = etatConfiguration(process.env);
  const sante = pointsBloquants(
    configuration,
    taches.error ? [] : etatTaches(dernieresTaches((taches.data ?? []) as PasseConsignee[]), new Date()),
    faitsManquants().length
  );
  const lecturesEnEchec = [bugsN1, bugs, idees, devis, brouillons, comptes, taches, alertesCritiques, artisans, evolutions, veille, missions].filter((r) => r.error).length;
  const valeurs = {
    bugsN1: nombre(bugsN1), bugs: nombre(bugs), idees: nombre(idees),
    devis: nombre(devis), brouillons: nombre(brouillons), comptes: nombre(comptes), alertesCritiques: nombre(alertesCritiques),
  };
  const signaux: Signal[] = [];
  const validationsArtisans = artisans.error ? null : Array.isArray(artisans.data) ? artisans.data.length : 0;
  const evolutionsAttendues = nombre(evolutions), etudesARelire = nombre(veille);

  if (valeurs.bugsN1 === null || valeurs.bugsN1 > 0) signaux.push({
    titre: "Vérifier les incidents bloquants",
    detail: valeurs.bugsN1 === null ? "Le nombre de problèmes bloquants est indisponible." : `${valeurs.bugsN1} problème${valeurs.bugsN1 > 1 ? "s" : ""} bloquant${valeurs.bugsN1 > 1 ? "s" : ""} à corriger.`,
    href: "/admin/retours?nature=bug", action: "Examiner les bugs", niveau: "urgent",
  });
  if (valeurs.alertesCritiques === null || valeurs.alertesCritiques > 0) signaux.push({
    titre: "Examiner les alertes critiques",
    detail: valeurs.alertesCritiques === null
      ? "Le nombre d'alertes critiques est indisponible. Ouvrez la file pour vérifier."
      : `${valeurs.alertesCritiques} alerte${valeurs.alertesCritiques > 1 ? "s" : ""} critique${valeurs.alertesCritiques > 1 ? "s" : ""} ouverte${valeurs.alertesCritiques > 1 ? "s" : ""}, toutes organisations confondues.`,
    action: "Ouvrir les alertes", niveau: "urgent",
  });
  if (sante > 0 || taches.error) signaux.push({
    titre: "Rétablir la santé du service",
    detail: taches.error ? "L'historique des tâches est indisponible." : `${sante} point${sante > 1 ? "s" : ""} de configuration ou de contrôle à traiter.`,
    href: "/admin/sante", action: "Voir les contrôles", niveau: "urgent",
  });
  if (validationsArtisans === null || validationsArtisans > 0) signaux.push({
    titre: "Valider les artisans", detail: validationsArtisans === null ? "La liste des inscriptions est indisponible." : `${validationsArtisans} inscription(s) à examiner avant autorisation.`, href: "/admin/artisans", action: "Examiner les inscriptions", niveau: "attention",
  });
  if (evolutionsAttendues === null || evolutionsAttendues > 0) signaux.push({
    titre: "Décider des évolutions préparées", detail: evolutionsAttendues === null ? "Les décisions attendues sont indisponibles." : `${evolutionsAttendues} proposition(s) attendent votre accord sur une version précise.`, href: "/admin/autonomie#ameliorations", action: "Examiner les propositions", niveau: "attention",
  });
  if (etudesARelire === null || etudesARelire > 0) signaux.push({
    titre: "Relire les études réglementaires", detail: etudesARelire === null ? "Les études à relire sont indisponibles." : `${etudesARelire} étude(s) préparée(s) attendent votre décision pour les utilisateurs.`, href: "/admin/veille", action: "Relire les études", niveau: "attention",
  });
  if (valeurs.devis === null || valeurs.devis > 0) signaux.push({
    titre: "Répondre aux demandes commerciales",
    detail: valeurs.devis === null ? "La file des devis est indisponible." : `${valeurs.devis} demande${valeurs.devis > 1 ? "s" : ""} en attente.`,
    href: "/admin/devis", action: "Voir les demandes commerciales", niveau: "attention",
  });
  if (valeurs.idees === null || valeurs.idees > 0 || (valeurs.bugs ?? 0) > 0) signaux.push({
    titre: "Trier les retours utilisateurs",
    detail: `Bugs ouverts : ${valeurs.bugs ?? "indisponible"} · idées à examiner : ${valeurs.idees ?? "indisponible"}.`,
    href: "/admin/retours", action: "Ouvrir les retours", niveau: "attention",
  });
  if (valeurs.brouillons === null || valeurs.brouillons > 0) signaux.push({
    titre: "Préparer le contenu éditorial",
    detail: valeurs.brouillons === null ? "La file éditoriale est indisponible." : `${valeurs.brouillons} proposition${valeurs.brouillons > 1 ? "s" : ""} ou brouillon${valeurs.brouillons > 1 ? "s" : ""}.`,
    href: "/admin/publications", action: "Relire avant publication", niveau: "suivi",
  });

  // 24/09 : « Situation au… » plutôt que « Données au chargement », mot de
  // développeur. La date et l'heure sont formatées à part pour la virgule.
  const maintenant = new Date();
  const situation = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(maintenant)}, ${new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Europe/Paris" }).format(maintenant)}`;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Aujourd’hui</h1>
        <span className="mono-discret">Situation au {situation}</span>
      </div>
      <p className="mesure-lecture mb-6 text-sm text-muted-foreground">
        La prochaine action utile, les signaux à examiner et les hypothèses de croissance au même endroit. Ce brief utilise les dossiers réellement enregistrés ; il ne lance ni correction automatique ni campagne publicitaire.
      </p>
      {lecturesEnEchec > 0 && <div role="alert" className="mb-5 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-sm text-[var(--destructive-soft-foreground)]">{lecturesEnEchec} source{lecturesEnEchec > 1 ? "s sont" : " est"} indisponible{lecturesEnEchec > 1 ? "s" : ""}. Les données manquantes sont signalées ci-dessous.</div>}

      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">À décider maintenant</h2>
        {/* 24/09 : l'état vide mène aux deux écrans qu'il recommande. Liens en ligne
            (soulignés par la règle `p a`) : .lien-discret passerait en bloc de
            44 px au doigt, au milieu de la phrase. */}
        {signaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun signal ouvert dans ces files. Consultez <Link className="text-[var(--bleu)]" href="/admin/sante">la santé du service</Link> et <Link className="text-[var(--bleu)]" href="/admin/territoire">le territoire</Link> avant de lancer une nouvelle action.</p> : (
          <div className="grid gap-3">
            {signaux.map((signal, i) => {
              const classe = "group flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-4 hover:bg-[var(--survol)]";
              const contenu = <>
              <div className="min-w-0">
                <span className="mono-discret">{i === 0 ? "Priorité 1" : `Priorité ${i + 1}`} · {signal.niveau === "urgent" ? "service" : signal.niveau === "attention" ? "opérations" : "croissance"}</span>
                <h3 className="mt-1 font-semibold text-[var(--encre)]">{signal.titre}</h3>
                <p className="mt-1 text-sm text-[var(--texte-secondaire)]">{signal.detail}</p>
              </div>
              <span className="lien-discret text-sm group-hover:underline">{signal.action} →</span>
              </>;
              return signal.href
                ? <Link key={signal.titre} href={signal.href} className={classe}>{contenu}</Link>
                : <OuvrirAlertes key={signal.titre} className={classe}>{contenu}</OuvrirAlertes>;
            })}
          </div>
        )}
      </section>

      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Le travail des équipes</h2>
        <p className="text-sm text-muted-foreground">Les urgences et décisions passent d’abord. Les opérations déjà autorisées continuent pendant vos rendez-vous commerciaux.</p>
        <p className="mt-3 text-sm">{missions.error ? "Le suivi des équipes est indisponible : leur bon fonctionnement ne peut pas être confirmé." : !missions.data?.length ? "Aucun passage enregistré pour le moment. Vérifiez les équipes avant de vous absenter." : "Consultez le dernier résultat de chaque équipe et ses éventuelles difficultés. Un passage terminé ne signifie pas que tous les dossiers sont résolus."}</p>
        <div className="mt-4 flex flex-wrap gap-3"><Link href="/admin/equipes" className="btn-secondaire">Vérifier mes équipes</Link><Link href="/admin/autonomie" className="btn-secondaire">Étudier les dossiers</Link><Link href="/admin/marketing" className="btn-secondaire">Suivre les publications</Link></div>
      </section>
      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Croissance : ordre de travail</h2>
        <p className="mesure-lecture mb-4 text-sm text-[var(--texte-secondaire)]">Hypothèse à valider avec conversions et coûts d&apos;acquisition : commencer par les propriétaires qui gèrent eux-mêmes leurs biens, constituer ensuite un réseau d&apos;artisans là où les interventions le justifient, puis développer les agences quand le service et les opérations sont stables.</p>
        <ol className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-lg border border-[var(--filet)] p-4"><b className="text-[var(--encre)]">1. Propriétaires directs</b><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Un dossier de location complet et une valeur immédiate. {valeurs.comptes === null ? "Clients actifs indisponibles." : `${valeurs.comptes} organisation${valeurs.comptes > 1 ? "s" : ""} active${valeurs.comptes > 1 ? "s" : ""} ou en essai, toutes familles confondues.`}</p></li>
          <li className="rounded-lg border border-[var(--filet)] p-4"><b className="text-[var(--encre)]">2. Artisans locaux</b><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Renforcer la couverture selon les incidents réels et les zones desservies. Ne pas supposer une demande avant de la mesurer.</p></li>
          <li className="rounded-lg border border-[var(--filet)] p-4"><b className="text-[var(--encre)]">3. Agences</b><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Accélérer après validation du support, des contrats et du traitement des opérations à plus grand volume.</p></li>
        </ol>
        {/* 24/09 : text-sm sur les liens eux-mêmes, sinon les 12 px de .lien-discret
            l'emportent sur le parent et ces liens sont plus petits que les autres. */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="lien-discret text-sm" href="/admin/territoire">Comparer les départements →</Link><Link className="lien-discret text-sm" href="/admin/clients">Voir les clients →</Link></div>
      </section>

      <section className="section-ecran">
        <h2 className="mb-2 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Publication et acquisition</h2>
        <p className="mesure-lecture text-sm leading-relaxed text-[var(--texte-secondaire)]">Utiliser le journal pour expliquer des cas concrets de gestion locative. Tester d&apos;abord Facebook pour les propriétaires directs dans un seul département, avec une page et une source de demande identifiables ; comparer ensuite Instagram à volume égal. Aucune dépense ni publication sur ces réseaux ne part depuis cet écran. Les résultats et le coût par client doivent être mesurés avant d&apos;étendre la campagne.</p>
        <Link className="lien-discret mt-3 inline-block text-sm" href="/admin/publications">Préparer un article vérifié →</Link>
      </section>

      <section className="section-ecran">
        <h2 className="mb-2 font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Aide à la décision par l&apos;IA</h2>
        <p className="mesure-lecture mb-4 text-sm text-[var(--texte-secondaire)]">À la demande, l&apos;IA reçoit seulement huit compteurs agrégés, dont les alertes ouvertes, et propose une prochaine vérification. Elle ne lit aucun dossier personnel et ne modifie ni données, ni prix, ni publications.</p>
        <BoutonBriefIA disponible={Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim())} />
      </section>
    </main>
  );
}
