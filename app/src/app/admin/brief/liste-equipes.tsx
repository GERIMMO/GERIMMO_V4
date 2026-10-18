"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Wallet, Wrench, ShieldCheck, Megaphone, Map, HeartPulse, Inbox } from "lucide-react";
import type { Equipe } from "@/lib/missions";
import styles from "./accueil.module.css";

const ICONES = { exploitation: Building2, finance: Wallet, incidents: Wrench, conformite: ShieldCheck, marketing: Megaphone, territoire: Map, qualite: HeartPulse };
export type RapportEquipe = { id: string; equipe: Equipe; nom: string; href: string; nonLu: boolean; attente: number; echecs: number; resultats: number; passage: string; bilanVide: boolean };

export function ListeEquipes({ rapports }: { rapports: RapportEquipe[] }) {
  const [filtre, setFiltre] = useState("tous");
  const filtres = [
    { id: "tous", nom: "Toutes", nombre: rapports.length },
    { id: "lire", nom: "À lire", nombre: rapports.filter(r => r.nonLu).length },
    { id: "attention", nom: "À vérifier", nombre: rapports.filter(r => r.attente > 0 || r.echecs > 0).length },
  ];
  const visibles = rapports.filter(r => filtre === "tous" || (filtre === "lire" ? r.nonLu : r.attente > 0 || r.echecs > 0));
  return <div className={styles.teamInbox}>
    <div className={styles.teamFilters} role="group" aria-label="Filtrer les comptes rendus">
      {filtres.map(f => <button type="button" key={f.id} aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}>{f.nom}<span>{f.nombre}</span></button>)}
    </div>
    <p className="sr-only" role="status">{visibles.length} compte{visibles.length > 1 ? "s" : ""} rendu{visibles.length > 1 ? "s" : ""} affiché{visibles.length > 1 ? "s" : ""}</p>
    <div className={styles.teamList}>
      {visibles.map(r => {
        const Icone = ICONES[r.equipe];
        return <Link key={r.id} href={r.href} className={styles.teamRow} data-equipe={r.equipe}>
          <span className={styles.teamIcon}><Icone size={20} strokeWidth={1.7} aria-hidden="true" /></span>
          <div className={styles.teamContent}><h3>{r.nom}</h3><p>{r.passage}</p>
            {!r.bilanVide && <span className={styles.rowFigures}>{r.resultats} résultat{r.resultats > 1 ? "s" : ""} · {r.attente} à valider · {r.echecs} échec{r.echecs > 1 ? "s" : ""}</span>}
          </div>
          <span className={styles.rowState} data-state={r.echecs > 0 ? "erreur" : r.attente > 0 ? "attente" : r.nonLu ? "lire" : "lu"}>{r.echecs > 0 ? `${r.echecs} échec${r.echecs > 1 ? "s" : ""}` : r.attente > 0 ? `${r.attente} à valider` : r.nonLu ? "À lire" : "Lu"}</span>
          <ArrowUpRight className={styles.rowArrow} size={17} aria-hidden="true" />
        </Link>;
      })}
      {visibles.length === 0 && <div className={styles.emptyInbox}><Inbox size={25} aria-hidden="true" /><strong>{filtre === "lire" ? "Tous les comptes rendus ont été lus." : "Aucun compte rendu à vérifier."}</strong><span>Vous pouvez consulter l’ensemble des équipes.</span><button type="button" onClick={() => setFiltre("tous")}>Voir toutes les équipes <ArrowUpRight size={14} aria-hidden="true" /></button></div>}
    </div>
  </div>;
}
