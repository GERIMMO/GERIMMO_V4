import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Banknote, Building2, FileCheck2, FilePenLine, Mail, Phone, Star } from "lucide-react";
import { clientDeService } from "@/lib/supabase/service";
import { DocumentsEntreprise } from "./documents-entreprise";
import { chargerNote, chargerPieces, verifierAccesArtisan } from "../acces";
import { degreEcheance, formaterSiret, formaterTelephone, METIERS } from "../libelles";
import { Carte, EnteteSousPage, Etiquette, Erreur } from "../ui";
import { FormulaireMetiersZones, ReglageVisibilite } from "./reglages-entreprise";
import styles from "./entreprise.module.css";

export const metadata = { title: "Mon entreprise" };
const ETATS_SIRET: Record<string, string> = { verifie: "SIRET vérifié", non_verifie: "SIRET en cours de vérification", invalide: "SIRET signalé invalide" };
const ETATS_PLATEFORME: Record<string, string> = { en_attente: "Inscription en cours de validation", valide: "Inscription validée", refuse: "Inscription refusée" };

export default async function PageEntreprise() {
  const { fiche } = await verifierAccesArtisan();
  const service = clientDeService();
  const documents = service ? await service.from("artisan_profils_documents").select("adresse,mentions,logo_data").eq("artisan_id", fiche.artisan_id).maybeSingle() : null;
  const [pieces, note] = await Promise.all([chargerPieces(), chargerNote()]);
  const piecesTendues = pieces.lignes.filter(p => ["expiree", "critique", "proche"].includes(degreEcheance(p.jours_avant_echeance, p.expiree))).length;
  const aucunePiece = !pieces.erreur && pieces.lignes.length === 0;
  const profilDocuments = documents && !documents.error ? documents.data : null;
  const raccourcis = [
    { href: "/artisan/attestations", titre: "Mes attestations", icone: FileCheck2, ton: "or", detail: pieces.erreur ? "Chargement indisponible" : aucunePiece ? "Aucune attestation déposée" : piecesTendues ? `${piecesTendues} à renouveler` : `${pieces.lignes.length} déposée${pieces.lignes.length > 1 ? "s" : ""}`, tendu: aucunePiece || piecesTendues > 0 },
    { href: "/artisan/facturation", titre: "Ma facturation", icone: Banknote, ton: "vert", detail: "Interventions et factures déposées", tendu: false },
    { href: "/artisan/note", titre: "Mes évaluations", icone: Star, ton: "violet", detail: note.erreur ? "Évaluations indisponibles" : note.note?.publiable ? `${Number(note.note.note_publiee ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sur 5 · ${note.note.nb_evaluations} avis` : "Note pas encore publiée", tendu: false },
  ];

  return <div className={styles.page}>
    <EnteteSousPage rubrique="entreprise" titre="Mon entreprise" mention="Votre fiche professionnelle et les informations de vos devis."/>
    <section className={styles.identite} aria-label="Votre entreprise">
      <div className={styles.logo}>{profilDocuments?.logo_data ? <Image src={profilDocuments.logo_data} alt={`Logo de ${fiche.raison_sociale}`} width={72} height={72} unoptimized/> : <Building2 size={32} aria-hidden/>}</div>
      <div className={styles.nomEntreprise}><p className={styles.surtitre}>Votre fiche professionnelle</p><h2>{fiche.raison_sociale}</h2><p>{(fiche.metiers ?? []).map(m => METIERS[m] ?? m).join(" · ") || "Métier à renseigner"}</p><div className={styles.statuts}>
        <Etiquette ton={fiche.siret_etat === "verifie" ? "ok" : fiche.siret_etat === "invalide" ? "alerte" : "attente"}>{ETATS_SIRET[fiche.siret_etat] ?? "SIRET à vérifier"}</Etiquette>
        <Etiquette ton={fiche.statut_plateforme === "valide" ? "ok" : fiche.statut_plateforme === "refuse" ? "alerte" : "attente"}>{ETATS_PLATEFORME[fiche.statut_plateforme] ?? "Statut à vérifier"}</Etiquette>
      </div></div>
      <Link href="#documents" className={styles.boutonDevis}><FilePenLine size={17} aria-hidden/>Personnaliser mes devis</Link>
    </section>
    <nav aria-label="Services de mon entreprise" className={styles.raccourcis}>{raccourcis.map(r => <Link key={r.href} href={r.href} className={styles.raccourci} data-ton={r.ton} data-attention={r.tendu}><span className={styles.icone}><r.icone size={21} aria-hidden/></span><span><strong>{r.titre}</strong><small>{r.detail}</small></span><ArrowUpRight size={17} aria-hidden/></Link>)}</nav>
    {aucunePiece && <p className={styles.alerteAttestation}><FileCheck2 size={17} aria-hidden/><span>Déposez votre décennale pour être proposé sur les {"travaux qui l'exigent"}. <Link href="/artisan/attestations">Ajouter une attestation <ArrowUpRight size={13} aria-hidden/></Link></span></p>}
    <div className={styles.grille}>
      <div className={styles.colonne}>
        <Carte className={styles.bloc}>
          <div className={styles.titreBloc}><span className={styles.icone}><Building2 size={19} aria-hidden/></span><div><h2>Identité et coordonnées</h2><p>Les repères de votre entreprise.</p></div></div>
          <dl className={styles.coordonnees}>
            <div><dt>SIRET</dt><dd className={styles.siret}>{formaterSiret(fiche.siret)}</dd></div>
            <div><dt><Phone size={14} aria-hidden/>Téléphone</dt><dd>{formaterTelephone(fiche.telephone)}</dd></div>
            <div><dt><Mail size={14} aria-hidden/>Adresse e-mail</dt><dd>{fiche.email || "Non renseignée"}</dd></div>
          </dl>
          {fiche.statut_motif && <p className={styles.commentaire}><strong>{fiche.statut_plateforme === "valide" ? "Commentaire de Gerimmo" : "Motif communiqué par Gerimmo"}</strong>{fiche.statut_motif}</p>}
          <p className={styles.aide}>Une correction de raison sociale ou de SIRET ? <Link href="/assistance?ecran=%2Fartisan%2Fentreprise&action=lien&retour=%2Fartisan%2Fentreprise">Contactez Gerimmo</Link>.</p>
        </Carte>
        <ReglageVisibilite visibilite={fiche.visibilite} siretVerifie={fiche.siret_etat === "verifie"}/>
      </div>
      <div className={styles.colonne}>
        <FormulaireMetiersZones metiers={(fiche.metiers ?? []).filter(m => m in METIERS)} codesPostaux={fiche.codes_postaux ?? []} complement={<div className={styles.noteZone}><p>Vos codes postaux indiquent votre secteur souhaité. Gerimmo confirme vos communes d’intervention et les métiers ouverts au réseau.</p><Link href="/artisan/regles">Les règles à connaître pour mon activité <ArrowUpRight size={14} aria-hidden/></Link></div>}/>
        {documents && !documents.error ? <DocumentsEntreprise profil={documents.data ?? { adresse: "", mentions: "", logo_data: null }}/>: <Erreur>Les informations de vos documents ne sont pas disponibles pour le moment. Réessayez avant de valider un devis.</Erreur>}
      </div>
    </div>
  </div>;
}
