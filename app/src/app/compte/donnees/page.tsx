import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { PREFIXE_DEMANDE_DONNEES, echeanceDemandeDonnees } from "@/lib/demandes-donnees";
import { ETATS_RETOUR, pageRetour } from "@/lib/retours";
import { formaterDateParis } from "@/lib/heure-paris";
import { FormulaireDonnees } from "./formulaire";
export const metadata = { title: "Mes données personnelles — Gerimmo" };
export default async function PageDonnees({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/connexion?suite=%2Fcompte%2Fdonnees");
  const page = pageRetour((await searchParams).page);
  const r = await db.from("retours_utilisateurs").select("id,titre,description,etat,reponse,cree_le", { count: "exact" })
    .eq("auteur_id", user.id).eq("nature", "question").is("organization_id", null).like("titre", PREFIXE_DEMANDE_DONNEES + "%")
    .order("cree_le", { ascending: false }).range((page-1)*20, page*20-1);
  const ids=(r.data??[]).map(d=>d.id);
  const historique=ids.length?await db.from("retours_historique").select("id,retour_id,message,cree_le").in("retour_id",ids).order("cree_le",{ascending:true}):{data:[],error:null};
  return <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-7">
    <Link className="lien-discret" href="/compte">← Mon compte</Link>
    <header><p className="eyebrow">Votre confidentialité</p><h1>Mes données personnelles</h1><p className="mt-2 text-muted-foreground">Consulter, corriger, demander un effacement ou la fermeture de votre compte : retrouvez ici le suivi de votre démarche.</p></header>
    <section className="loc-carte space-y-4"><h2>Faire une demande</h2><p className="text-sm">Nous vous répondons dans un délai d’un mois. Une prolongation motivée peut être nécessaire pour une demande complexe et vous sera expliquée dans ce délai.</p><FormulaireDonnees cle={randomUUID()}/></section>
    <section className="space-y-3"><h2>Mes demandes</h2>
      {r.error?<p role="alert" className="err">Le suivi est indisponible. Rechargez avant de conclure qu’une demande est absente.</p>:!r.data?.length?<p className="loc-carte">Aucune demande sur cette page.</p>:r.data.map(d=><article key={d.id} className="loc-carte space-y-2"><div className="flex flex-wrap justify-between gap-2"><h3>{d.titre.replace(PREFIXE_DEMANDE_DONNEES, "")}</h3><span className="puce">{ETATS_RETOUR[d.etat] ?? d.etat}</span></div><p className="text-sm text-muted-foreground">Réf. {d.id.slice(0,8).toUpperCase()} · Reçue le {formaterDateParis(d.cree_le)} · Échéance de réponse initiale : {formaterDateParis(echeanceDemandeDonnees(d.cree_le)!)}</p><p className="whitespace-pre-wrap">{d.description}</p>{d.reponse&&<p className="rounded-lg bg-[var(--creme)] p-3 whitespace-pre-wrap"><strong>Réponse de Gerimmo</strong><br/>{d.reponse}</p>}<details className="text-sm"><summary className="cursor-pointer">Historique de la demande</summary>{historique.error?<p role="alert">Historique indisponible.</p>:<ol className="mt-2 space-y-2">{(historique.data??[]).filter(h=>h.retour_id===d.id).map(h=><li key={h.id}><time>{formaterDateParis(h.cree_le)}</time><p className="whitespace-pre-wrap">{h.message}</p></li>)}</ol>}</details></article>)}
      {(page>1||(r.count??0)>20)&&<nav aria-label="Pages des demandes de données" className="flex justify-between">{page>1?<Link href={`?page=${page-1}`}>Précédente</Link>:<span/>}<span>Page {page}</span>{page*20<(r.count??0)&&<Link href={`?page=${page+1}`}>Suivante</Link>}</nav>}
    </section>
    <section className="loc-carte space-y-2"><h2>Ce qui peut être conservé</h2><p className="text-sm">La fermeture d’un compte et l’effacement des documents sont deux opérations distinctes. Certaines factures, pièces contractuelles ou preuves peuvent devoir être conservées pour une obligation ou un litige. Nous précisons alors les éléments concernés, le motif et leur durée.</p><p className="text-sm">Les copies chez les prestataires de signature et les sauvegardes sont prises en compte dans l’examen. Pour les données d’une location, votre propriétaire ou gestionnaire reste le responsable de traitement.</p><Link className="lien-discret" href="/confidentialite">Lire les règles de confidentialité</Link></section>
  </main>;
}
