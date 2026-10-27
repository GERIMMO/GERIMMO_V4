"use client";

import { useContext, type ReactNode } from "react";
import { ArrowRight, Check, CircleAlert, FileCheck2, ClipboardList } from "lucide-react";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { useRacineEspace } from "@/components/racine-espace-contexte";
import { correctionsRecapBail, type RubriqueRecapBail } from "@/lib/presentation-recapitulatif-bail";
import type { RecapitulatifPiecesBail } from "@/lib/recapitulatif-pieces-bail";
import styles from "./bilan-bail.module.css";

const nomsEtapes: Record<string, string> = { bail: "Le contrat", personnes: "Les personnes", logement: "Logement et bâtiment", loyer: "Loyer et paiement", documents: "Documents et énergie", clauses: "Conditions du bail" };
const nomsStatuts = { pret: "Disponible", a_completer: "À compléter", a_verifier: "À vérifier", non_concerne: "Non concerné" };

export function BilanBail({ orgId, rubriques, pieces, lectureSeule, children }: { orgId: string; rubriques: RubriqueRecapBail[]; pieces?: RecapitulatifPiecesBail; lectureSeule: boolean; children?: ReactNode }) {
  const controle = useContext(CompletudeBail), racine = useRacineEspace();
  const corrections = correctionsRecapBail(controle?.manquants ?? [], rubriques, orgId, racine);
  const groupes = Object.entries(nomsEtapes).map(([id, titre]) => ({ id, titre, corrections: corrections.filter(c => c.etape === id) })).filter(g => g.corrections.length);
  const piecesSignature = pieces?.pieces.filter(p => p.moment === "signature" && p.statut !== "non_concerne") ?? [];
  const piecesPretes = piecesSignature.filter(p => p.statut === "pret").length;
  const erreurInformations = controle?.erreur || rubriques.find(r => r.erreur)?.erreur;
  return <div className={styles.bilan}>
    {!lectureSeule && <section id="bilan-bail" className={styles.vueEnsemble} aria-labelledby="titre-bilan-bail">
      <div className={styles.entete}><div><span className={styles.surtitre}>Dernière vérification</span><h3 id="titre-bilan-bail">Avant la signature</h3><p>Corrigez les points signalés, puis relisez le contrat.</p></div><a href="#signature" className={styles.lien}>Documents et signatures<ArrowRight size={16} aria-hidden="true"/></a></div>
      <div className={styles.indicateurs}>
        <a href={corrections.length ? "#corrections-bail" : "#informations-bail"} data-etat={erreurInformations ? "attention" : corrections.length ? "attention" : controle ? "pret" : "attention"}>
          {controle && !erreurInformations && !corrections.length ? <Check aria-hidden="true"/> : <ClipboardList aria-hidden="true"/>}<span><strong>{erreurInformations ? "Contrôle indisponible" : corrections.length ? `${corrections.length} information${corrections.length > 1 ? "s" : ""} à compléter` : controle ? "Informations renseignées" : "Informations à vérifier"}</strong><small>Contenu du contrat</small></span>
        </a>
        <a href="#pieces-recap-bail" data-etat={pieces?.erreur || piecesPretes !== piecesSignature.length ? "attention" : "pret"}><FileCheck2 aria-hidden="true"/><span><strong>{pieces?.erreur ? "Pièces à vérifier" : `${piecesPretes} / ${piecesSignature.length} pièces disponibles`}</strong><small>Pour la signature</small></span></a>
        <a href="#signature"><ArrowRight aria-hidden="true"/><span><strong>Relire et signer</strong><small>PDF du bail et suivi des signatures</small></span></a>
      </div>
      {erreurInformations && <p role="alert" className={styles.erreur}>{erreurInformations} Actualisez la page avant de poursuivre.</p>}
      {groupes.length > 0 && <div id="corrections-bail" className={styles.corrections}><h4><CircleAlert size={18} aria-hidden="true"/>À compléter dans le contrat</h4><div className={styles.groupes}>{groupes.map(g => <section key={g.id}><h5>{g.titre}</h5><ul>{g.corrections.map(c => <li key={c.mention}><a href={c.href}><span>{c.libelle}</span><ArrowRight size={15} aria-hidden="true"/></a></li>)}</ul></section>)}</div></div>}
    </section>}
    {pieces && !lectureSeule && <section className={styles.pieces} id="pieces-recap-bail" aria-labelledby="titre-pieces-recap"><header><h3 id="titre-pieces-recap">Pièces du dossier</h3><a className={styles.lien} href="#etape-bail-5">Gérer les documents<ArrowRight size={16} aria-hidden="true"/></a></header>
      {pieces.erreur && <p role="alert" className={styles.erreur}>{pieces.erreur}</p>}
      {([ ["signature", "Pour la signature"], ["entree", "Avant la remise des clés"], ["gestion", "Suivi du logement"] ] as const).map(([moment, titre]) => {
        const lignes = pieces.pieces.filter(p => p.moment === moment && p.statut !== "non_concerne");
        return lignes.length ? <div key={moment} className={styles.groupePieces}><h4>{titre}</h4><ul>{lignes.map(p => <li key={p.id} data-etat={p.statut}><span className={styles.iconePiece}>{p.statut === "pret" ? <Check size={18} aria-label="Disponible"/> : <CircleAlert size={18} aria-label={nomsStatuts[p.statut]}/>}</span><div><strong>{p.titre}</strong><p>{p.detail}</p></div><a href={p.href} aria-label={`${p.statut === "pret" ? "Consulter" : "Vérifier"} : ${p.titre}`}>{nomsStatuts[p.statut]}<ArrowRight size={15} aria-hidden="true"/></a></li>)}</ul></div> : null;
      })}
      {pieces.pieces.some(p => p.statut === "non_concerne") && <details className={styles.nonConcerne}><summary>Pièces non requises pour ce dossier</summary><ul>{pieces.pieces.filter(p => p.statut === "non_concerne").map(p => <li key={p.id}><strong>{p.titre}</strong> · {p.detail}</li>)}</ul></details>}
    </section>}
    <section id="informations-bail" className={styles.informations} aria-labelledby="titre-informations-bail"><div className={styles.titreSection}><h3 id="titre-informations-bail">Informations enregistrées</h3><p>{lectureSeule ? "Le contrat et les parties associées." : "Chaque rubrique donne accès à sa modification."}</p></div><div className={styles.grille}>{rubriques.map(r => {
      const incompletes = r.lignes.filter(l => (l.valeur === null && !l.facultatif) || l.aCorriger).length;
      return <section key={r.id} className={styles.rubrique}><header><h4>{r.titre}</h4>{!lectureSeule && <a className={styles.lien} href={r.href} aria-label={`Modifier : ${r.titre}`}>Modifier<ArrowRight size={14} aria-hidden="true"/></a>}</header>
        {r.erreur ? <p role="alert" className={styles.erreur}>{r.erreur}</p> : <><span className={styles.etatRubrique} data-attention={incompletes > 0 || undefined}>{incompletes ? `${incompletes} information${incompletes > 1 ? "s" : ""} à vérifier` : `${r.lignes.length} information${r.lignes.length > 1 ? "s" : ""} enregistrée${r.lignes.length > 1 ? "s" : ""}`}</span><dl>{r.lignes.map((l, i) => <div key={`${l.champ}-${i}`} data-manquant={(l.valeur === null && !l.facultatif) || l.aCorriger || undefined}><dt>{l.libelle}</dt><dd>{l.valeur ?? (lectureSeule ? "Non renseigné" : <a href={l.href}>Compléter<ArrowRight size={13} aria-hidden="true"/></a>)}{l.aCorriger && !lectureSeule && <a href={l.href}>Corriger<ArrowRight size={13} aria-hidden="true"/></a>}</dd></div>)}</dl>{!r.lignes.length && <p>Aucune personne associée.</p>}</>}
      </section>;
    })}</div></section>
    {children}
  </div>;
}
