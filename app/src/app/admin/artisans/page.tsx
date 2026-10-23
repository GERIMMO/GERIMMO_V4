import { ArrowUpRight, CheckCheck, ClipboardCheck, FileCheck2, History, Info, MapPinned, ShieldCheck, Users, Wrench } from "lucide-react";
import shared from "../repertoires.module.css";
import styles from "../relation-clients.module.css";
import { initiales } from "@/lib/clients-supervision";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { nomInvitant } from "@/lib/invitations-artisan";
import { METIERS, PIECES_ARTISAN } from "@/app/artisan/libelles";
import { libelleZone } from "@/lib/zone-artisan";
import { DecisionArtisan } from "./decision-artisan";
import { RetourDecisionsArtisan } from "./retour-decisions";

// Le nom de l'entrée de menu (audit 25/09, C8).
export const metadata = { title: "Réseau d’artisans" };

type Inscription = { artisan_id: string; raison_sociale: string; siret: string; siret_etat: string; telephone: string | null; email: string | null; metiers: string[] | null; nb_pieces: number; decennale_valide: boolean; rc_pro_deposee: boolean; inscrit_le: string; purge_prevue_le: string | null };
type Piece = { id: string; artisan_id: string; type: string; expire_le: string | null };
type Invitation = { artisan_id: string; organisation: string; acceptee: boolean };
type Decision = { id: string; raison_sociale: string; statut_plateforme: "valide" | "refuse"; statut_motif: string | null; statut_decide_le: string | null };
const date = (valeur: string) => new Date(valeur).toLocaleDateString("fr-FR", { timeZone: "UTC" });
const ETATS_SIRET: Record<string, string> = { verifie: "Vérifié", non_verifie: "Non vérifié", invalide: "Invalide" };
const DECISIONS_PAR_PAGE = 20;

export default async function InscriptionsArtisan({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const supabase = await createClient();
  const { data: autorise, error: erreurAcces } = await supabase.rpc("is_super_admin");
  if (erreurAcces || autorise !== true) return <main className="mx-auto max-w-4xl p-7"><TitreEcran rubrique="incidents">Accès réservé à la supervision</TitreEcran></main>;
  const recherche = await searchParams;
  const pageDemandee = typeof recherche.page === "string" && /^[1-9]\d*$/.test(recherche.page)
    && Number.isSafeInteger(Number(recherche.page)) ? Number(recherche.page) : 1;
  const [file, compteDecisions, invitations] = await Promise.all([
    supabase.rpc("artisans_a_valider"),
    supabase.from("artisans").select("id", { count: "exact", head: true })
      .in("statut_plateforme", ["valide", "refuse"]),
    // Décision du 15/10/2026 : d'où vient l'artisan invité par un propriétaire. Une aide à l'examen, jamais une validation.
    supabase.rpc("invitations_des_artisans_a_valider"),
  ]);
  const invitePar = new Map<string, Invitation[]>();
  for (const i of (invitations.data ?? []) as Invitation[]) invitePar.set(i.artisan_id, [...(invitePar.get(i.artisan_id) ?? []), i]);
  const totalDecisions = compteDecisions.error ? null : compteDecisions.count;
  const nombrePages = Math.max(1, Math.ceil((totalDecisions ?? 0) / DECISIONS_PAR_PAGE));
  const pageDecisions = Math.min(pageDemandee, nombrePages);
  const debutDecisions = (pageDecisions - 1) * DECISIONS_PAR_PAGE;
  const decisions = totalDecisions === null
    ? { data: null, error: compteDecisions.error ?? { message: "Comptage indisponible" } }
    // Motifs et dates de décision : fermés à la lecture directe (20261014842000), lus par la fonction de la supervision.
    : await supabase.rpc("decisions_artisans_supervision", { p_debut: debutDecisions, p_nombre: DECISIONS_PAR_PAGE });
  const inscriptions = (file.data ?? []) as Inscription[];
  const [pieces, zones] = inscriptions.length > 0
    ? await Promise.all([
      supabase.from("artisan_pieces").select("id, artisan_id, type, expire_le").in("artisan_id", inscriptions.map((a) => a.artisan_id)).is("retiree_le", null),
      // Décision du 23/10/2026 : valider un artisan le rend proposable dans SA zone (dès que son profil est public).
      // Le validateur voit donc ce qu'il ouvre.
      supabase.from("artisan_zones").select("artisan_id, code_postal").in("artisan_id", inscriptions.map((a) => a.artisan_id)),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const zonesDe = (artisanId: string) => ((zones.data ?? []) as { artisan_id: string; code_postal: string }[])
    .filter(z => z.artisan_id === artisanId).map(z => z.code_postal).sort().map(libelleZone);

  const siretsAVerifier = inscriptions.filter(a => a.siret_etat !== "verifie").length;
  return <RetourDecisionsArtisan><main className={shared.page}>
    <header className={shared.header}>
      <div><p className={shared.eyebrow}>PARTENAIRES DE GERIMMO</p><TitreEcran rubrique="incidents">Réseau d’artisans</TitreEcran><p className={shared.subtitle}>Examinez les nouvelles entreprises et retrouvez vos décisions, au même endroit.</p></div>
      <Link href="/admin/couverture" className="btn-or"><MapPinned size={16} aria-hidden="true" />Couverture du réseau</Link>
    </header>
    <div className={shared.stats} data-columns="3" aria-label="Suivi des inscriptions artisan">
      <a href="#inscriptions" className={shared.stat} data-tone="ambre"><span className={shared.statIcon}><ClipboardCheck size={20} aria-hidden="true" /></span><strong>{file.error ? "—" : inscriptions.length}</strong><span>Inscriptions à examiner</span><small>{file.error ? "Lecture indisponible" : "Dans la file de validation"}</small></a>
      <a href="#inscriptions" className={shared.stat}><span className={shared.statIcon}><ShieldCheck size={20} aria-hidden="true" /></span><strong>{file.error ? "—" : siretsAVerifier}</strong><span>SIRET à vérifier</span><small>Parmi les inscriptions en attente</small></a>
      <a href="#decisions" className={shared.stat} data-tone="vert"><span className={shared.statIcon}><History size={20} aria-hidden="true" /></span><strong>{totalDecisions ?? "—"}</strong><span>Inscriptions traitées</span><small>Validées ou refusées</small></a>
    </div>
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <section id="inscriptions" className={styles.panel} aria-labelledby="inscriptions-titre">
          <div className={styles.panelHeading}><div><h2 id="inscriptions-titre">Les inscriptions à examiner</h2><p>L’identité de l’entreprise, ses justificatifs, puis votre décision.</p></div><ClipboardCheck size={20} aria-hidden="true" /></div>
          {file.error ? <p role="alert" className={styles.notice}>Impossible de charger les inscriptions. Rechargez pour réessayer.</p> : inscriptions.length === 0 ? <div className={styles.empty}><CheckCheck size={28} aria-hidden="true" /><h3>Aucune inscription en attente</h3><p>Les nouvelles entreprises apparaîtront ici pour examen. Vous pouvez consulter les artisans déjà inscrits dans l’annuaire.</p><Link href="/admin/clients">Ouvrir l’annuaire <ArrowUpRight size={15} aria-hidden="true" /></Link></div> : <>
            {invitations.error && <p role="alert" className={styles.notice}>L’origine des invitations est momentanément indisponible.</p>}
            <div className={styles.queue}>{inscriptions.map(artisan => <article key={artisan.artisan_id} className={styles.application}>
              <header className={styles.applicationHeader}>
                <span className={shared.avatar} data-family="artisan" aria-hidden="true">{initiales(artisan.raison_sociale)}</span>
                <div className={styles.applicationIdentity}><h3>{artisan.raison_sociale}</h3><p>{(artisan.metiers ?? []).map(m => METIERS[m] ?? m).join(" · ") || "Métier non renseigné"}</p>{(invitePar.get(artisan.artisan_id) ?? []).map((i,n) => <p key={n}>Invité par {nomInvitant(i.organisation) ?? "un propriétaire (nom masqué : il contient un lien, un numéro ou le nom de Gerimmo)"}{i.acceptee ? "" : " (invitation pas encore acceptée)"}</p>)}</div>
                <time dateTime={artisan.inscrit_le}>Inscrit le {date(artisan.inscrit_le)}</time>
              </header>
              <div className={styles.applicationBody}>
                <h4 className={styles.checkTitle}><Wrench size={16} aria-hidden="true" />1. L’entreprise</h4>
                <dl className={styles.identityDetails}>
                  <div><dt>SIRET</dt><dd>{artisan.siret}<span className={shared.badge} data-tone={artisan.siret_etat === "verifie" ? "vert" : artisan.siret_etat === "invalide" ? "rouge" : "ambre"}>{ETATS_SIRET[artisan.siret_etat] ?? artisan.siret_etat}</span></dd></div>
                  <div><dt>Contact</dt><dd>{artisan.email || "E-mail non renseigné"}{artisan.telephone && <><br />{artisan.telephone}</>}</dd></div>
                  <div><dt>Zone d’intervention</dt><dd>{zones.error ? "Zone indisponible" : zonesDe(artisan.artisan_id).join(" · ") || "Aucune zone déclarée"}</dd></div>
                </dl>
                <p className={styles.subtle}>Validé, il sera proposé aux propriétaires de cette zone pour ses métiers dès que son profil sera public.</p>
                {artisan.siret_etat !== "verifie" && <DecisionArtisan artisanId={artisan.artisan_id} operation="verifier_siret" />}
                <section className={styles.check} aria-label={`Justificatifs de ${artisan.raison_sociale}`}>
                  <h4 className={styles.checkTitle}><FileCheck2 size={16} aria-hidden="true" />2. Les justificatifs <span className={shared.badge}>{artisan.nb_pieces} pièce{artisan.nb_pieces > 1 ? "s" : ""}</span></h4>
                  <div className={styles.documentStates}><span className={shared.badge} data-tone={artisan.decennale_valide ? "vert" : "ambre"}>Décennale · {artisan.decennale_valide ? "en cours de validité" : "absente ou échue"}</span><span className={shared.badge} data-tone={artisan.rc_pro_deposee ? "vert" : "ambre"}>RC pro · {artisan.rc_pro_deposee ? "déposée, non échue" : "absente ou échue"}</span></div>
                  <p className={styles.subtle}>Les dates ne remplacent pas la relecture des documents.</p>
                  {pieces.error ? <p role="alert" className="err mt-3">Les justificatifs sont indisponibles. Réessayez avant de décider.</p> : <ul className={styles.documents}>{((pieces.data ?? []) as Piece[]).filter(p => p.artisan_id === artisan.artisan_id).map(p => <li key={p.id}><a href={`/admin/artisans/pieces/${p.id}/fichier`} target="_blank" rel="noopener noreferrer">{PIECES_ARTISAN[p.type] ?? p.type}<ArrowUpRight size={13} aria-hidden="true" /><span className="sr-only"> (nouvel onglet)</span></a><span>{p.expire_le ? `Échéance : ${date(p.expire_le)}` : "Sans échéance"}</span></li>)}</ul>}
                </section>
                <section className={styles.decisionArea} aria-label={`Décider pour ${artisan.raison_sociale}`}><h4 className={styles.checkTitle}><ClipboardCheck size={16} aria-hidden="true" />3. Votre décision</h4>{pieces.error ? <p className={styles.subtle}>La validation reste indisponible tant que les justificatifs ne peuvent pas être consultés.</p> : <DecisionArtisan artisanId={artisan.artisan_id} operation="validation" siretVerifie={artisan.siret_etat === "verifie"} />}<details className={styles.refusal}><summary>Refuser cette inscription</summary><div><DecisionArtisan artisanId={artisan.artisan_id} operation="refus" /></div></details></section>
                {artisan.purge_prevue_le && <p className={`${styles.subtle} mt-4`}>Sans suite, échéance de conservation prévue le {date(artisan.purge_prevue_le)}.</p>}
              </div>
            </article>)}</div>
          </>}
        </section>
        <section id="decisions" className={styles.panel} aria-labelledby="decisions-titre">
          <div className={styles.panelHeading}><div><h2 id="decisions-titre">Vos décisions récentes</h2><p>De la plus récente à la plus ancienne. Une inscription refusée peut être réexaminée.</p></div><History size={20} aria-hidden="true" /></div>
          {decisions.error ? <p role="alert" className={styles.notice}>Historique indisponible. <Link href="/admin/artisans?page=1#decisions" className="underline">Réessayer</Link></p> : <>
            {totalDecisions === 0 ? <p className={styles.pastEmpty}>Aucune inscription validée ou refusée pour le moment. Vos prochaines décisions seront conservées ici.</p> : <ul className={styles.pastDecisions}>{((decisions.data ?? []) as Decision[]).map(a => <li key={a.id}><div className={styles.pastDecisionHeading}><strong>{a.raison_sociale}{a.statut_decide_le && <time dateTime={a.statut_decide_le}>{date(a.statut_decide_le)}</time>}</strong><span className={shared.badge} data-tone={a.statut_plateforme === "valide" ? "vert" : "rouge"}>{a.statut_plateforme === "valide" ? "Validée" : "Refusée"}</span></div>{a.statut_motif && <p>{a.statut_motif}</p>}{a.statut_plateforme === "refuse" && <div><DecisionArtisan artisanId={a.id} operation="remise_en_attente" /></div>}</li>)}</ul>}
            {nombrePages > 1 && <nav aria-label="Pagination des décisions" className={shared.pagination}>
              {pageDecisions > 1 ? <Link href={`/admin/artisans?page=${pageDecisions - 1}#decisions`} rel="prev">Précédent</Link> : <span />}
              <span aria-current="page">Page {pageDecisions} sur {nombrePages}</span>
              {pageDecisions < nombrePages ? <Link href={`/admin/artisans?page=${pageDecisions + 1}#decisions`} rel="next">Suivant</Link> : <span />}
            </nav>}
          </>}
        </section>
      </div>
      <aside className={styles.sidebar} aria-label="Développement du réseau">
        <section className={styles.networkCard}><MapPinned size={29} aria-hidden="true" /><p className={styles.eyebrow}>LE RÉSEAU SUR LE TERRAIN</p><h2>Chaque artisan<br />choisit sa zone.</h2><p>Il déclare ses métiers et sa zone ; validé et public, il y est proposé. Suivez la couverture qui en résulte.</p><Link href="/admin/couverture">Voir la couverture <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
        <section className={styles.guide}><p className={styles.eyebrow}>VOTRE EXAMEN</p><h2>Trois points de contrôle</h2><ol><li><div><strong>L’identité de l’entreprise</strong><span>Vérifier le SIRET et les coordonnées.</span></div></li><li><div><strong>Les justificatifs</strong><span>Relire les pièces et leurs dates.</span></div></li><li><div><strong>Une décision tracée</strong><span>Valider ou préciser le motif du refus.</span></div></li></ol><Link href="/admin/clients"><Users size={15} aria-hidden="true" />Consulter l’annuaire<ArrowUpRight size={15} aria-hidden="true" /></Link></section>
      </aside>
    </div>
    <p className={styles.context}><Info size={15} aria-hidden="true" /><span>La validation d’un artisan le rend proposable dans la zone et pour les métiers qu’il a déclarés, dès que son profil est public ; elle conserve sa visibilité choisie. Les contrôles d’assurance restent appliqués à chaque intervention.</span></p>
  </main></RetourDecisionsArtisan>;
}
