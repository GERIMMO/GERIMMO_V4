"use client";

import { useState } from "react";
import { FileText, Upload, Send, Plus, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";
import { erreurJustificatif, type JustificatifPrepare, type ResultatJustificatif } from "@/lib/creation-fiche-personne";
import styles from "./creation-personne.module.css";

export function JustificatifsPersonne({ pieces, changer, resultats, enCours, peutDemander = true }: {
  pieces: JustificatifPrepare[];
  changer: (pieces: JustificatifPrepare[]) => void;
  resultats?: Record<string, ResultatJustificatif>;
  enCours: boolean;
  peutDemander?: boolean;
}) {
  const [mode, setMode] = useState<"depot" | "demande">("depot");
  function ajouter(titre: string, type: JustificatifPrepare["type"]) {
    changer([...pieces, { id: crypto.randomUUID(), titre, type, mode: peutDemander ? mode : "depot" }]);
  }
  function modifier(id: string, valeurs: Partial<JustificatifPrepare>) {
    changer(pieces.map(p => p.id === id ? { ...p, ...valeurs } : p));
  }
  return <div className={styles.documents}>
    <div className={styles.documentsIntro}>
      <div><strong>Justificatifs — Facultatif à cette étape</strong><p>Ajoutez les documents disponibles ou préparez une demande. Vous pourrez compléter le dossier plus tard.</p></div>
      <span className={styles.documentBadge}>{pieces.length} document{pieces.length > 1 ? "s" : ""}</span>
    </div>
    <fieldset disabled={enCours} className="min-w-0 space-y-4">
      <legend className="sr-only">Préparer des justificatifs</legend>
      <div className={styles.modesDocuments}>
        <button type="button" aria-pressed={mode === "depot" || !peutDemander} onClick={() => setMode("depot")}><Upload size={20} aria-hidden="true" /><span><b>Déposer moi-même</b><small>J’ai déjà les fichiers</small></span></button>
        {peutDemander && <button type="button" aria-pressed={mode === "demande"} onClick={() => setMode("demande")}><Send size={20} aria-hidden="true" /><span><b>Demander à la personne</b><small>Elle les déposera dans son espace</small></span></button>}
      </div>
      <div className={styles.choixDocuments}>
        <span>{mode === "demande" && peutDemander ? "Quelle pièce demander ?" : "Quel document ajouter ?"}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => ajouter("Pièce d’identité", "piece_identite")}><Plus size={14} aria-hidden="true" />Pièce d’identité</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => ajouter("Justificatif de domicile", "justificatif")}><Plus size={14} aria-hidden="true" />Domicile</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => ajouter("", "justificatif")}><Plus size={14} aria-hidden="true" />Autre document</Button>
      </div>
      {pieces.length === 0 ? <div className={styles.documentsVide}><FileText size={28} aria-hidden="true" /><p>Aucun justificatif préparé.<br /><span>Vous pouvez passer au récapitulatif.</span></p></div> : <div className={styles.listeDocuments}>
        {pieces.map((p, index) => {
          const resultat = resultats?.[p.id];
          const verrouille = Boolean(resultat?.succes || resultat?.incertain);
          const erreur = erreurJustificatif(p);
          return <fieldset key={p.id} disabled={verrouille} className={styles.documentPrepare}>
            <legend className="sr-only">Document {index + 1}</legend>
            <header><span className={styles.documentIcone}>{p.mode === "depot" ? <Upload size={18} /> : <Send size={18} />}</span><strong>{p.titre || "Nouveau justificatif"}</strong><span className={styles.documentBadge} data-etat={resultat?.succes ? "recu" : p.mode}>{resultat?.succes ? (p.mode === "depot" ? "Déposé" : "Demande enregistrée") : p.mode === "depot" ? "À déposer" : "À demander"}</span>{!verrouille && <button type="button" aria-label={`Retirer ${p.titre || "le document"}`} onClick={() => changer(pieces.filter(x => x.id !== p.id))}><X size={17} aria-hidden="true" /></button>}</header>
            <div className={styles.grille}>
              <div className={styles.champ}><Label htmlFor={`doc-titre-${p.id}`}>Nom du document</Label><Input id={`doc-titre-${p.id}`} value={p.titre} maxLength={p.mode === "demande" ? 120 : 200} onChange={e => modifier(p.id, { titre: e.currentTarget.value })} placeholder="Ex. : justificatif de revenus" /></div>
              <div className={styles.champ}><Label htmlFor={`doc-type-${p.id}`}>Catégorie</Label><select id={`doc-type-${p.id}`} className={styles.documentSelect} value={p.type} onChange={e => modifier(p.id, { type: e.currentTarget.value as JustificatifPrepare["type"] })}><option value="piece_identite">Pièce d’identité</option><option value="justificatif">Autre justificatif</option><option value="attestation_assurance">Attestation d’assurance</option></select></div>
              {p.mode === "depot" && <div className={`${styles.champ} ${styles.large}`}><Label htmlFor={`doc-fichier-${p.id}`}>Fichier — PDF, JPG ou PNG, 10 Mo maximum</Label><ChampFichier id={`doc-fichier-${p.id}`} name={`document-${p.id}`} accept=".pdf,.jpg,.jpeg,.png" onChange={e => modifier(p.id, { fichier: e.currentTarget.files?.[0] })} /></div>}
              {p.mode === "depot" && p.type === "attestation_assurance" && <div className={styles.champ}><Label htmlFor={`doc-date-${p.id}`}>Date d’expiration — Facultatif</Label><Input id={`doc-date-${p.id}`} type="date" value={p.expireLe ?? ""} onChange={e => modifier(p.id, { expireLe: e.currentTarget.value })} /></div>}
            </div>
            {resultat?.succes && <p className="flex items-center gap-2 text-sm text-success-soft-foreground"><CheckCircle2 size={16} aria-hidden="true" />{resultat.succes}</p>}
            {resultat?.avertissement && <p role="status" className="text-sm text-warning-soft-foreground">{resultat.avertissement}</p>}
            {(resultat?.erreur || erreur) && <p role={resultat?.erreur ? "alert" : undefined} className="text-sm text-destructive">{resultat?.erreur || erreur}</p>}
          </fieldset>;
        })}
      </div>}
    </fieldset>
    {pieces.some(p => p.mode === "demande") && <p className={styles.documentInformation}>Les demandes seront enregistrées après la création de la fiche. Vous pourrez ensuite inviter la personne à son espace pour qu’elle dépose ses pièces.</p>}
  </div>;
}
