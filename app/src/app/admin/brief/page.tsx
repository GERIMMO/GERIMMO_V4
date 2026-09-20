import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { faitsManquants } from "@/lib/editeur";
import { etatConfiguration, etatTaches, pointsBloquants } from "@/lib/sante-service";
import { dernieresTaches, type PasseConsignee } from "@/lib/tache";
import { BoutonBriefIA } from "./bouton-ia";

export const metadata = { title: "Brief de pilotage — Gerimmo" };

type Signal = { titre: string; detail: string; href: string; action: string; niveau: "urgent" | "attention" | "suivi" };

function nombre(resultat: { count: number | null; error: unknown }) {
  return resultat.error ? null : resultat.count ?? 0;
}

export default async function PageBrief() {
  // L'accès super admin est contrôlé par le layout. Chaque lecture conserve son
  // état d'erreur : une source indisponible ne devient jamais un faux zéro.
  const supabase = await createClient();
  const [bugsN1, bugs, idees, devis, brouillons, comptes, taches] = await Promise.all([
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").eq("gravite", "N1").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "bug").in("etat", ["nouveau", "en_examen", "en_cours"]),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "idee").in("etat", ["nouveau", "en_examen"]),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("publications").select("id", { count: "exact", head: true }).in("statut", ["proposition", "brouillon"]),
    supabase.from("organizations").select("id", { count: "exact", head: true }).in("status", ["active", "essai"]),
    supabase.from("tech_log").select("evenement, details, created_at").like("evenement", "tache_%").order("created_at", { ascending: false }).limit(200),
  ]);

  const configuration = etatConfiguration(process.env);
  const sante = pointsBloquants(
    configuration,
    taches.error ? [] : etatTaches(dernieresTaches((taches.data ?? []) as PasseConsignee[]), new Date()),
    faitsManquants().length
  );
  const lecturesEnEchec = [bugsN1, bugs, idees, devis, brouillons, comptes, taches].filter((r) => r.error).length;
  const valeurs = {
    bugsN1: nombre(bugsN1), bugs: nombre(bugs), idees: nombre(idees),
    devis: nombre(devis), brouillons: nombre(brouillons), comptes: nombre(comptes),
  };
  const signaux: Signal[] = [];
  if (valeurs.bugsN1 === null || valeurs.bugsN1 > 0) signaux.push({
    titre: "Vérifier les incidents bloquants",
    detail: valeurs.bugsN1 === null ? "Le nombre de bugs critiques est indisponible." : `${valeurs.bugsN1} signalement${valeurs.bugsN1 > 1 ? "s" : ""} N1 ouvert${valeurs.bugsN1 > 1 ? "s" : ""}.`,
    href: "/admin/retours?nature=bug", action: "Examiner les bugs", niveau: "urgent",
  });
  if (sante > 0 || taches.error) signaux.push({
    titre: "Rétablir la santé du service",
    detail: taches.error ? "L'historique des tâches est indisponible." : `${sante} point${sante > 1 ? "s" : ""} de configuration ou de contrôle à traiter.`,
    href: "/admin/sante", action: "Voir les contrôles", niveau: "urgent",
  });
  if (valeurs.devis === null || valeurs.devis > 0) signaux.push({
    titre: "Répondre aux demandes commerciales",
    detail: valeurs.devis === null ? "La file des devis est indisponible." : `${valeurs.devis} demande${valeurs.devis > 1 ? "s" : ""} en attente.`,
    href: "/admin/devis", action: "Ouvrir les devis", niveau: "attention",
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Brief de pilotage</h1>
        <span className="mono-discret">Données au chargement · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date())}</span>
      </div>
      <p className="mesure-lecture mb-6 text-sm text-muted-foreground">
        La prochaine action utile, les signaux à examiner et les hypothèses de croissance au même endroit. Ce brief utilise les dossiers réellement enregistrés ; il ne lance ni correction automatique ni campagne publicitaire.
      </p>
      {lecturesEnEchec > 0 && <div role="alert" className="mb-5 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-sm text-[var(--destructive-soft-foreground)]">{lecturesEnEchec} source{lecturesEnEchec > 1 ? "s sont" : " est"} indisponible{lecturesEnEchec > 1 ? "s" : ""}. Les données manquantes sont signalées ci-dessous.</div>}

      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[var(--pas-section)] text-[var(--encre)]">À décider maintenant</h2>
        {signaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun signal ouvert dans ces files. Consultez la santé du service et le territoire avant de lancer une nouvelle action.</p> : (
          <div className="grid gap-3">
            {signaux.map((signal, i) => <Link key={signal.titre} href={signal.href} className="group flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-4 hover:bg-[var(--survol)]">
              <div className="min-w-0">
                <span className="mono-discret">{i === 0 ? "Priorité 1" : `Priorité ${i + 1}`} · {signal.niveau === "urgent" ? "service" : signal.niveau === "attention" ? "opérations" : "croissance"}</span>
                <h3 className="mt-1 font-semibold text-[var(--encre)]">{signal.titre}</h3>
                <p className="mt-1 text-sm text-[var(--texte-secondaire)]">{signal.detail}</p>
              </div>
              <span className="lien-discret text-sm group-hover:underline">{signal.action} →</span>
            </Link>)}
          </div>
        )}
      </section>

      <section className="section-ecran">
        <h2 className="mb-3 font-heading text-[var(--pas-section)] text-[var(--encre)]">Croissance : ordre de travail</h2>
        <p className="mb-4 text-sm text-[var(--texte-secondaire)]">Hypothèse à valider avec conversions et coûts d&apos;acquisition : commencer par les propriétaires qui gèrent eux-mêmes leurs biens, constituer ensuite un réseau d&apos;artisans là où les interventions le justifient, puis développer les agences quand le service et les opérations sont stables.</p>
        <ol className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-lg border border-[var(--filet)] p-4"><b className="text-[var(--encre)]">1. Propriétaires directs</b><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Un dossier de location complet et une valeur immédiate. {valeurs.comptes === null ? "Clients actifs indisponibles." : `${valeurs.comptes} organisation${valeurs.comptes > 1 ? "s" : ""} active${valeurs.comptes > 1 ? "s" : ""} ou en essai, toutes familles confondues.`}</p></li>
          <li className="rounded-lg border border-[var(--filet)] p-4"><b className="text-[var(--encre)]">2. Artisans locaux</b><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Renforcer la couverture selon les incidents réels et les zones desservies. Ne pas supposer une demande avant de la mesurer.</p></li>
          <li className="rounded-lg border border-[var(--filet)] p-4"><b className="text-[var(--encre)]">3. Agences</b><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Accélérer après validation du support, des contrats et du traitement des opérations à plus grand volume.</p></li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="lien-discret" href="/admin/territoire">Comparer les départements →</Link><Link className="lien-discret" href="/admin/clients">Voir les clients →</Link></div>
      </section>

      <section className="section-ecran">
        <h2 className="mb-2 font-heading text-[var(--pas-section)] text-[var(--encre)]">Publication et acquisition</h2>
        <p className="text-sm leading-relaxed text-[var(--texte-secondaire)]">Utiliser le journal pour expliquer des cas concrets de gestion locative. Tester d&apos;abord Facebook pour les propriétaires directs dans un seul département, avec une page et une source de demande identifiables ; comparer ensuite Instagram à volume égal. Aucune dépense ni publication sur ces réseaux ne part depuis cet écran. Les résultats et le coût par client doivent être mesurés avant d&apos;étendre la campagne.</p>
        <Link className="lien-discret mt-3 inline-block text-sm" href="/admin/publications">Préparer un article vérifié →</Link>
      </section>

      <section className="section-ecran">
        <h2 className="mb-2 font-heading text-[var(--pas-section)] text-[var(--encre)]">Aide à la décision par l&apos;IA</h2>
        <p className="mb-4 text-sm text-[var(--texte-secondaire)]">À la demande, l&apos;IA reçoit seulement six compteurs agrégés et propose une prochaine vérification. Elle ne lit aucun dossier personnel et ne modifie ni données, ni prix, ni publications.</p>
        <BoutonBriefIA disponible={Boolean(process.env.OPENAI_API_KEY?.trim())} />
      </section>
    </main>
  );
}
