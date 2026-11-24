import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { PREFIXE_DEMANDE_DONNEES, echeanceDemandeDonnees } from "@/lib/demandes-donnees";
import { ETATS_RETOUR, pageRetour } from "@/lib/retours";
import { formaterDateParis } from "@/lib/heure-paris";
import { FormulaireDonnees } from "./formulaire";
import { ArchiveComplete } from "./archive";
import { styleMarque } from "@/lib/marque-organisation";
import { identiteContactLocataire } from "@/lib/identite-contact-locataire";
import {
  BandeauCompte,
  LIEN_CONFIDENTIALITE,
  RenvoiDonneesLocation,
  lireContactCompteLocataire,
  lireEspaceLocataire,
  lireMarqueLocataire,
} from "../bandeau-compte";
export const metadata = { title: "Mes données personnelles — Gerimmo" };
export default async function PageDonnees({ searchParams }: { searchParams: Promise<{ page?: string; archive?: string }> }) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/connexion?suite=%2Fcompte%2Fdonnees");
  const parametres = await searchParams;
  const page = pageRetour(parametres.page);
  const r = await db.from("retours_utilisateurs").select("id,titre,description,etat,reponse,cree_le", { count: "exact" })
    .eq("auteur_id", user.id).eq("nature", "question").is("organization_id", null).like("titre", PREFIXE_DEMANDE_DONNEES + "%")
    .order("cree_le", { ascending: false }).range((page-1)*20, page*20-1);
  const ids=(r.data??[]).map(d=>d.id);
  const historique=ids.length?await db.from("retours_historique").select("id,retour_id,message,cree_le").in("retour_id",ids).order("cree_le",{ascending:true}):{data:[],error:null};
  // Phase 3, lot 61. Cette page n'avait pas le bandeau de /compte (ni retour à « Mon espace », ni « Se déconnecter » :
  // E021, E143) et ne disait pas au locataire ce que /compte lui dit juste avant : les demandes sur les données de SA
  // LOCATION vont à son gestionnaire ou à son bailleur (E019, E140). Le formulaire d'ici, lui, n'est lu que par
  // l'assistance (demande enregistrée sans organisation). Mêmes lectures et même phrase que /compte.
  const [marque, espaceLocataire, contactLocataire, artisan] = await Promise.all([
    lireMarqueLocataire(), lireEspaceLocataire(), lireContactCompteLocataire(), db.rpc("mon_artisan"),
  ]);
  const estArtisan = ((artisan.data ?? []) as unknown[]).length > 0;
  const aucuneDemande = !r.data?.length;
  return <div className="flex min-h-full flex-1 flex-col" style={styleMarque(marque)}>
   <BandeauCompte compteId={user.id} marque={marque} estArtisan={estArtisan} espaceLocataire={espaceLocataire} />
   <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-7">
    <Link className="lien-retour" href="/compte">← Sécurité du compte</Link>
    <header><p className="eyebrow">Votre confidentialité</p><h1>Mes données personnelles</h1><p className="mt-2 text-muted-foreground">Consulter, corriger, demander un effacement ou la fermeture de votre compte : retrouvez ici le suivi de votre démarche.</p></header>
    {/* Le renvoi passe AVANT le formulaire : c'est là que le locataire choisissait le mauvais destinataire. Un seul
        espace de locataire : son interlocuteur est nommé, avec le lien ; plusieurs : la tournure de /compte. */}
    {/* Lot 61 (reprise, M1) : un ANCIEN locataire (bail terminé, adhésion inactive) n'a plus d'adhésion active :
        `contactLocataire` est nul, et il ne lisait ici aucun renvoi alors que /compte, juste avant, lui dit de
        s'adresser à son bailleur ou à son gestionnaire. Tout compte qui n'est pas celui d'un artisan lit donc au moins
        la tournure générique de /compte (celle qu'y lisent aussi un propriétaire ou une agence). */}
    {contactLocataire ? <section className="loc-carte space-y-2" data-renvoi-location>
      <h2 className="titre-carte">Les données de votre location</h2>
      <p className="text-sm">{espaceLocataire
        ? <RenvoiDonneesLocation espace={espaceLocataire} identite={contactLocataire.identite ?? identiteContactLocataire(null)} />
        : <>Pour les données d&apos;une location, adressez-vous à son bailleur ou à son gestionnaire, depuis la messagerie de l&apos;espace concerné.</>}</p>
      <p className="text-sm text-muted-foreground">Le formulaire ci-dessous ne lui est pas transmis : il sert aux demandes sur votre compte lui-même (copie ou correction de ses données, fermeture du compte).</p>
    </section> : !estArtisan && <section className="loc-carte space-y-2" data-renvoi-location="generique">
      <h2 className="titre-carte">Les données d&apos;une location</h2>
      <p className="text-sm">Pour les données d&apos;une location, adressez-vous à son bailleur ou à son gestionnaire.</p>
      <p className="text-sm text-muted-foreground">Le formulaire ci-dessous ne lui est pas transmis : il sert aux demandes sur votre compte lui-même (copie ou correction de ses données, fermeture du compte).</p>
    </section>}
    <ArchiveComplete etat={parametres.archive}/>
    <section className="loc-carte space-y-4"><h2 className="titre-carte">{contactLocataire || !estArtisan ? "Faire une demande sur mon compte" : "Faire une demande"}</h2><p className="text-sm">Nous vous répondons dans un délai d’un mois. Une prolongation motivée peut être nécessaire pour une demande complexe et vous sera expliquée dans ce délai.</p><FormulaireDonnees cle={randomUUID()}/></section>
    {/* E020, E142 : « Mes demandes » est aussi le titre des demandes de réparation de l'espace locataire, et « Aucune
        demande sur cette page » laissait croire à d'autres pages. Le titre dit de quelles demandes il s'agit ; la
        première page vide dit qu'il n'y en a aucune (comme /assistance). E023 : le titre de chaque demande est un h3. */}
    <section className="space-y-3"><h2>Mes demandes sur mes données</h2>
      {r.error?<p role="alert" className="err">Le suivi est indisponible. Rechargez avant de conclure qu’une demande est absente.</p>:aucuneDemande?<p className="loc-carte">{page===1?"Vous n’avez fait aucune demande sur vos données.":"Aucune demande sur cette page."}</p>:r.data!.map(d=><article key={d.id} className="loc-carte space-y-2"><div className="flex flex-wrap justify-between gap-2"><h3 className="titre-carte" data-titre-demande-donnees>{d.titre.replace(PREFIXE_DEMANDE_DONNEES, "")}</h3><span className="puce">{ETATS_RETOUR[d.etat] ?? d.etat}</span></div><p className="text-sm text-muted-foreground">Réf. {d.id.slice(0,8).toUpperCase()} · Reçue le {formaterDateParis(d.cree_le)} · Échéance de réponse initiale : {formaterDateParis(echeanceDemandeDonnees(d.cree_le)!)}</p><p className="whitespace-pre-wrap">{d.description}</p>{d.reponse&&<p className="rounded-lg bg-[var(--creme)] p-3 whitespace-pre-wrap"><strong>Réponse de Gerimmo</strong><br/>{d.reponse}</p>}<details className="text-sm"><summary className="cursor-pointer">Historique de la demande</summary>{historique.error?<p role="alert">Historique indisponible.</p>:<ol className="mt-2 space-y-2">{(historique.data??[]).filter(h=>h.retour_id===d.id).map(h=><li key={h.id}><time>{formaterDateParis(h.cree_le)}</time><p className="whitespace-pre-wrap">{h.message}</p></li>)}</ol>}</details></article>)}
      {(page>1||(r.count??0)>20)&&<nav aria-label="Pages des demandes de données" className="flex justify-between">{page>1?<Link href={`?page=${page-1}`}>Précédente</Link>:<span/>}<span>Page {page}</span>{page*20<(r.count??0)&&<Link href={`?page=${page+1}`}>Suivante</Link>}</nav>}
    </section>
    {/* E022, E144 : le lien s'appelait « règles de confidentialité » ici et « politique de confidentialité » sur /compte,
        en 12 px sans soulignement ; même libellé et même dessin que sur /compte. */}
    <section className="loc-carte space-y-2"><h2 className="titre-carte">Ce qui peut être conservé</h2><p className="text-sm">La fermeture d’un compte et l’effacement des documents sont deux opérations distinctes. Certaines factures, pièces contractuelles ou preuves peuvent devoir être conservées pour une obligation ou un litige. Nous précisons alors les éléments concernés, le motif et leur durée.</p><p className="text-sm">Les copies chez les prestataires de signature et les sauvegardes sont prises en compte dans l’examen. Pour les données d’une location, votre propriétaire ou gestionnaire reste le responsable de traitement.</p><p><Link className={LIEN_CONFIDENTIALITE} href="/confidentialite">Lire la politique de confidentialité</Link></p></section>
   </main>
  </div>;
}
