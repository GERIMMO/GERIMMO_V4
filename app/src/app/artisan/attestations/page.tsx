import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Building2, CheckCircle2, Clock3, FileCheck2, FileText, Info, Plus, ShieldCheck, ShieldPlus, Upload } from "lucide-react";
import { chargerPieces, verifierAccesArtisan } from "../acces";
import { dateSimple, degreEcheance, LISTE_PIECES, PIECES_ARTISAN, texteEcheance, type DegreEcheance } from "../libelles";
import { Avertissement, EnteteSousPage, Erreur, Etiquette, Succes } from "../ui";
import { FormulairePiece } from "./formulaire-piece";
import styles from "./attestations.module.css";

export const metadata = { title: "Mes attestations — Espace artisan" };
const TON_ECHEANCE: Record<DegreEcheance, "ok" | "attente" | "alerte" | "neutre"> = { expiree: "alerte", critique: "alerte", proche: "attente", a_venir: "attente", ok: "ok", sans_date: "neutre" };
const PRESENTATION = {
  decennale: { icone: ShieldCheck, aide: "Pour les travaux qui l’exigent." },
  rc_pro: { icone: ShieldPlus, aide: "Votre responsabilité professionnelle." },
  urssaf: { icone: FileCheck2, aide: "Votre situation auprès de l’URSSAF." },
  kbis: { icone: Building2, aide: "L’identité de votre entreprise." },
  certification: { icone: BadgeCheck, aide: "Vos qualifications et certifications." },
};

export default async function PageAttestations(props: PageProps<"/artisan/attestations">) {
  const { fiche } = await verifierAccesArtisan();
  const { inscrit, type } = await props.searchParams;
  const pieces = await chargerPieces();
  const deposees = new Map(pieces.lignes.map(p => [p.type, p]));
  const typeDemande = typeof type === "string" && (LISTE_PIECES as readonly string[]).includes(type) ? type : undefined;
  const manquantes = LISTE_PIECES.filter(t => t !== "certification" && !deposees.has(t));
  const renouvellements = [...deposees.values()].filter(p => ["expiree", "critique", "proche", "a_venir"].includes(degreEcheance(p.jours_avant_echeance, p.expiree))).sort((a,b) => (a.jours_avant_echeance ?? 0) - (b.jours_avant_echeance ?? 0));
  const prochaine = renouvellements[0]?.type ?? manquantes[0];

  return <div className={styles.page}>
    <EnteteSousPage rubrique="documents" titre="Mes attestations" mention="Votre dossier professionnel, partagé pour toutes vos interventions."
      action={!pieces.erreur && <Link href={`/artisan/attestations?type=${prochaine ?? "decennale"}#deposer`} className={styles.principal}><Plus size={17} aria-hidden/>Déposer un document</Link>}/>
    {inscrit && <Succes>Votre entreprise est inscrite. Déposez maintenant votre décennale et votre RC pro : Gerimmo valide l’inscription au vu de ces pièces, et vous pourrez recevoir de nouvelles demandes après validation.</Succes>}
    {fiche.statut_plateforme === "en_attente" && <Avertissement>Votre inscription est examinée par Gerimmo. Elle ne sera validée qu’au vu de vos justificatifs.</Avertissement>}
    {pieces.erreur ? <Erreur>Vos attestations n’ont pas pu être lues. <a className="underline" href="/artisan/attestations">Recharger la page</a> avant de déposer un document.</Erreur> : <>
      <div className={styles.indicateurs} aria-label="État du dossier">
        <div><span className={styles.icone} data-ton="bleu"><FileCheck2 size={21} aria-hidden/></span><span><strong>{deposees.size}</strong><span>Document{deposees.size > 1 ? "s" : ""} déposé{deposees.size > 1 ? "s" : ""}</span></span></div>
        <div><span className={styles.icone} data-ton="or"><Clock3 size={21} aria-hidden/></span><span><strong>{renouvellements.length}</strong><span>À renouveler</span></span></div>
        <div><span className={styles.icone} data-ton="violet"><Upload size={21} aria-hidden/></span><span><strong>{manquantes.length}</strong><span>À déposer <small>hors certification facultative</small></span></span></div>
      </div>
      {typeDemande && <FormulairePiece key={typeDemande} typeSuggere={typeDemande}/>}
      <div className={styles.grille}>
        <section className={styles.dossier} aria-labelledby="titre-attestations"><div className={styles.enteteDossier}><div><h2 id="titre-attestations">Mes documents professionnels</h2><p>Retrouvez chaque pièce et sa date de validité.</p></div><FileText size={22} aria-hidden/></div>
          <ul>{LISTE_PIECES.map(t => {
            const piece = deposees.get(t);
            const degre = piece ? degreEcheance(piece.jours_avant_echeance, piece.expiree) : null;
            const Icone = PRESENTATION[t].icone;
            return <li key={t} className={styles.document} data-prioritaire={t === "decennale"} data-expire={piece?.expiree}>
              <span className={styles.icone}><Icone size={21} aria-hidden/></span>
              <div className={styles.detail}><h3>{PIECES_ARTISAN[t]}</h3><p>{PRESENTATION[t].aide}</p><div className={styles.statut}><Etiquette ton={degre ? TON_ECHEANCE[degre] : t === "certification" ? "neutre" : "attente"}>{piece ? texteEcheance(piece.jours_avant_echeance, piece.expiree) : t === "certification" ? "Facultatif" : "À déposer"}</Etiquette>{piece?.expire_le && <span>Jusqu’au {dateSimple(piece.expire_le)}</span>}</div></div>
              <div className={styles.actionsDocument}>{piece && <Link href={`/artisan/attestations/${piece.piece_id}/fichier`} target="_blank" rel="noreferrer" className={styles.ouvrir}>Ouvrir <ArrowUpRight size={14} aria-hidden/><span className="sr-only"> : {PIECES_ARTISAN[t]}</span></Link>}<Link href={`/artisan/attestations?type=${t}#deposer`} className={styles.secondaire}>{piece ? "Renouveler" : "Déposer"}<ArrowRight size={14} aria-hidden/><span className="sr-only"> : {PIECES_ARTISAN[t]}</span></Link></div>
            </li>;
          })}</ul>
        </section>
        <aside className={styles.aide} aria-label="Repères pour vos attestations">
          <div className={styles.prochaineAction}><span className={styles.surtitre}>{prochaine ? "Prochaine action" : "Votre dossier"}</span><h2>{prochaine ? renouvellements.length ? "Une échéance à anticiper" : "Complétez votre dossier" : "Vos documents sont à jour"}</h2><p>{prochaine ? PIECES_ARTISAN[prochaine] : "Aucun document attendu ni renouvellement à prévoir dans les 60 prochains jours."}</p>{prochaine ? <Link href={`/artisan/attestations?type=${prochaine}#deposer`}>{renouvellements.length ? "Renouveler ce document" : "Déposer ce document"}<ArrowRight size={15} aria-hidden/></Link> : <CheckCircle2 size={24} aria-hidden/>}</div>
          <div className={styles.reperes}><h2><ShieldCheck size={19} aria-hidden/>Votre décennale</h2><p>Seule la décennale conditionne l’affectation, pour les travaux qui l’exigent. L’entretien courant reste ouvert et une intervention en cours n’est jamais interrompue.</p><div className={styles.note}><Info size={16} aria-hidden/><p>Un nouveau document remplace la version précédente du même type.</p></div><Link href="/artisan/entreprise">Revenir à ma fiche entreprise <ArrowRight size={14} aria-hidden/></Link></div>
        </aside>
      </div>
    </>}
  </div>;
}
