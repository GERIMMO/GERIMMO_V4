"use client";
import { useState, useTransition } from "react";
import { proposerLectureDocument } from "@/app/actions/lecture-document";
import type { LectureDocument } from "@/lib/lecture-document-ia";
import { Button } from "./ui/button";
import styles from "./consommations.module.css";

export function LectureDocumentAssistee({ orgId, demandeId = null, fichier, appliquer }: { orgId: string; demandeId?: string | null; fichier: File | null; appliquer: (l: LectureDocument) => void }) {
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState("");
  const [lecture, setLecture] = useState<LectureDocument | null>(null);
  if (!fichier) return null;
  if (fichier.size > 3_500_000) return <p className={styles.caption}>Ce document peut être joint, mais il est trop volumineux pour le préremplissage. Renseignez les informations de la facture ou choisissez un fichier plus léger.</p>;
  const analyser = () => start(async () => {
    setErreur(""); setLecture(null);
    const fd = new FormData(); fd.set("fichier", fichier);
    try { const r = await proposerLectureDocument(orgId, demandeId, fd); if (r.erreur) setErreur(r.erreur); if (r.lecture) setLecture(r.lecture); }
    catch { setErreur("La lecture n’a pas abouti. Vous pouvez remplir les informations directement."); }
  });
  return <div className={styles.list}><Button type="button" size="sm" variant="outline" disabled={pending} onClick={analyser}>{pending ? "Lecture du document…" : demandeId ? "Lire l’index sur ma photo" : "Préremplir depuis la facture"}</Button>
    <p className={styles.caption}>Ce fichier sera lu par l’assistant IA. Les informations proposées resteront à vérifier.</p>
    {erreur && <p role="alert" className={styles.warning}>{erreur}</p>}
    {lecture && <div className={styles.warning}><p>Lecture terminée. Vérifiez les valeurs proposées.</p>{lecture.avertissements.map((a, i) => <p key={i}>{a}</p>)}<Button type="button" size="sm" onClick={() => { appliquer(lecture); setLecture(null); }}>Utiliser les valeurs lues</Button></div>}
  </div>;
}
