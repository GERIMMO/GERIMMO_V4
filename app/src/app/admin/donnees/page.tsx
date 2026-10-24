import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PREFIXE_DEMANDE_DONNEES, TYPES_DEMANDE_DONNEES, echeanceDemandeDonnees } from "@/lib/demandes-donnees";
import { ETATS_RETOUR, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { formaterDateParis } from "@/lib/heure-paris";
import { DecisionRetour } from "../retours/decisions-retour";
import { ControleArchivesSignatures } from "./archives";
import { BilanConservationContacts } from "./bilan-conservation";
import { FermeturesComptes, comptesAvecFermetureProgrammee, supervisionPermanente } from "./fermetures";
import { ProgrammerFermeture } from "./programmer-fermeture";
export const metadata = { title: "Données personnelles et fermeture des comptes" };
const ETAPES = [
  ["Qualifier la demande", "Vérifier le titulaire connecté, les données concernées et le responsable de traitement. Ne demander une pièce supplémentaire qu’en cas de doute justifié. Répondre sous un mois ; expliquer toute prolongation dans ce délai."],
  ["Séparer effacement et conservation", "Recenser le compte, les dossiers, les documents, les pièces comptables et les signatures. Pour chaque conservation : motif, accès restreint et date de fin. Un litige ou une facture ne justifie pas de garder tout le compte."],
  ["Programmer la fermeture", "Sur la demande, afficher le bilan sans rien effacer, puis convenir avec le titulaire du sort d’un abonnement payé en cours : fin de la période payée, ou quatorze jours avec remboursement de la part non utilisée. « Programmer la fermeture » arrête la souscription chez Stripe à cette date ; sans abonnement payé, l’effacement a lieu quatorze jours après. Jusque-là, la fermeture reste annulable, et un litige ou une créance la gèle (motif écrit)."],
  ["Traiter les copies prestataires", "Chez Zoho, pour chaque demande relevée dans le bilan d’exécution, vérifier le PDF signé et le certificat archivés, leur lisibilité et leurs empreintes avant de déplacer une copie en corbeille. La mise en corbeille n’est pas un effacement définitif. Vérifier séparément la purge finale, les autres prestataires et les sauvegardes."],
  ["Vérifier l’exécution", "La nuit de la date d’effet, après la sauvegarde du jour, Gerimmo archive la preuve d’un contrat payé, efface l’espace et ses fichiers (ou la seule adhésion s’il reste d’autres gérants), retire le lien des dossiers d’autres propriétaires et les prévient, puis supprime le compte, ou le neutralise si un journal ou une demande y fait encore référence. Contrôler le bilan d’exécution ; l’effacement est réappliqué après toute restauration."],
  ["Répondre et clôturer", "Le courriel « Votre compte Gerimmo est fermé » part la nuit même : ce qui est effacé, ce qui reste et jusqu’à quand. Répondre aussi dans le suivi, puis ne marquer Résolu qu’après vérification de ces résultats ; utiliser En cours pendant les interventions."],
];
export default async function PageDonneesAdmin({ searchParams }: { searchParams: Promise<{ page?: string; etat?: string }> }) {
  const db = await createClient(); const sa = await db.rpc("is_super_admin");
  if (sa.error || sa.data !== true) redirect("/espaces");
  const p = await searchParams; const page = pageRetour(p.page); const terminees = p.etat === "resolu";
  let q = db.from("retours_utilisateurs").select("*", { count: "exact" }).eq("nature", "question").is("organization_id", null)
    .like("titre", PREFIXE_DEMANDE_DONNEES + "%").order("cree_le", { ascending: true });
  q = terminees ? q.eq("etat", "resolu") : q.in("etat", ["nouveau", "en_examen", "en_cours"]);
  const r = await q.range((page-1)*20, page*20-1);
  const demandes = (r.data ?? []) as (RetourUtilisateur & { auteur_id: string })[];
  const ids = demandes.map(d => d.id);
  const historique = ids.length ? await db.from("retours_historique").select("id,retour_id,message,cree_le").in("retour_id", ids).order("cree_le", { ascending: true }) : { data: [], error: null };
  const programmees = await comptesAvecFermetureProgrammee();
  const permanente = await supervisionPermanente();
  const titresFermeture = new Set([PREFIXE_DEMANDE_DONNEES + TYPES_DEMANDE_DONNEES.fermeture, PREFIXE_DEMANDE_DONNEES + TYPES_DEMANDE_DONNEES.effacement]);
  const aujourdHui = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const adresse = (n: number) => `?etat=${terminees?"resolu":"ouvert"}&page=${n}`;
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-7">
    <Link className="lien-discret" href="/admin/securite">← Sécurité et conformité</Link>
    <header><p className="eyebrow">Confidentialité et comptes</p><h1>Demandes sur les données</h1><p className="mt-2 text-muted-foreground">Une file privée, de la demande à la réponse. Les opérations d’effacement restent contrôlées et tracées.</p></header>
    <div className="flex flex-wrap gap-3"><Link className="btn-secondaire" href="?etat=ouvert" aria-current={!terminees?"page":undefined}>À traiter</Link><Link className="btn-secondaire" href="?etat=resolu" aria-current={terminees?"page":undefined}>Terminées</Link><Link className="lien-discret" href="/admin/journaux#conservation">Durées et nettoyages</Link><Link className="lien-discret" href="/admin/sante#sauvegarde">Dernière sauvegarde</Link></div>
    <FermeturesComptes />
    <ControleArchivesSignatures />
    <BilanConservationContacts />
    <section aria-label="Demandes privées" className="space-y-4">
      {r.error?<p role="alert" className="err">Lecture indisponible : aucun total ni statut ne peut être confirmé.</p>:<p className="text-sm">{r.count ?? 0} demande{r.count===1?"":"s"} {terminees?"terminée(s)":"à traiter"}.</p>}
      {demandes.map(d=>{const limite=echeanceDemandeDonnees(d.cree_le);const retard=!terminees&&!d.reponse&&limite&&limite<aujourdHui;return <article key={d.id} className="loc-carte space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h2>{d.titre.replace(PREFIXE_DEMANDE_DONNEES,"")}</h2><span className="puce">{ETATS_RETOUR[d.etat]}</span></div>
        <p className={retard?"text-sm text-destructive":"text-sm text-muted-foreground"}>Réf. {d.id.slice(0,8).toUpperCase()} · Reçue le {formaterDateParis(d.cree_le)} · Première réponse avant le {limite?formaterDateParis(limite):"date à vérifier"}{retard?" — échéance initiale dépassée":""}</p>
        <Link className="lien-discret text-sm" href={`/admin/comptes/${d.auteur_id}`}>Ouvrir le compte demandeur →</Link>
        <p className="whitespace-pre-wrap">{d.description}</p>{d.reponse&&<p className="rounded-lg bg-[var(--creme)] p-3 whitespace-pre-wrap"><strong>Dernière réponse</strong><br/>{d.reponse}</p>}
        <details className="text-sm"><summary className="cursor-pointer">Historique de la demande</summary>{historique.error ? <p role="alert">Historique indisponible.</p> : <ol className="mt-2 space-y-2">{(historique.data ?? []).filter(h => h.retour_id === d.id).map(h => <li key={h.id}><time>{formaterDateParis(h.cree_le)}</time><p className="whitespace-pre-wrap">{h.message}</p></li>)}</ol>}</details>
        {!terminees && permanente && titresFermeture.has(d.titre) && !programmees.has(d.auteur_id) && <ProgrammerFermeture accountId={d.auteur_id} demandeId={d.id}/>}
        <DecisionRetour retour={d} donneesPersonnelles/>
      </article>})}
      {(page>1||(r.count??0)>20)&&<nav aria-label="Pages des demandes de données" className="flex justify-between">{page>1?<Link href={adresse(page-1)}>Précédente</Link>:<span/>}<span>Page {page}</span>{page*20<(r.count??0)&&<Link href={adresse(page+1)}>Suivante</Link>}</nav>}
    </section>
    <section className="loc-carte space-y-4"><h2>Procédure de traitement</h2><p className="text-sm">Cette page enregistre les réponses et décisions, et programme les fermetures de comptes. Aucune suppression n’a lieu au clic : l’effacement s’exécute la nuit de la date d’effet, après la sauvegarde du jour, et reste annulable jusque-là.</p><ol className="space-y-4">{ETAPES.map(([titre,texte],i)=><li key={titre} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--creme)] font-semibold">{i+1}</span><div><h3>{titre}</h3><p className="mt-1 text-sm text-muted-foreground">{texte}</p></div></li>)}</ol></section>
    <p className="text-sm text-muted-foreground">Repère : <a className="lien-discret" href="https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees" target="_blank" rel="noreferrer">droits des personnes — CNIL</a>. Les durées configurées doivent être justifiées par catégorie ; elles ne remplacent pas une validation juridique.</p>
  </main>;
}
