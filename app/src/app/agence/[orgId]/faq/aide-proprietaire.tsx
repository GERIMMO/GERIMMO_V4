"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, Inbox, Lightbulb, MessageCircle, Search, X } from "lucide-react";
import { correspond } from "@/lib/roles-personnes";
import { EnteteReglages } from "../profil/famille-reglages";
import { QUESTIONS } from "./questions";
import styles from "./aide.module.css";
import { useBaseEspace } from "@/components/racine-espace-contexte";

const THEMES = ["Tout", "Prise en main", "Locataires", "Finances", "Abonnement"] as const;

export function AideProprietaire({ orgId, assistance }: { orgId: string; assistance: string }) {
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
  const [recherche, setRecherche] = useState("");
  const [theme, setTheme] = useState<string>("Tout");
  const idRecherche = useId();
  const questions = QUESTIONS.filter((q) => (theme === "Tout" || q.theme === theme) && correspond(recherche, q.question, q.reponse, q.theme));
  const reinitialiser = () => { setRecherche(""); setTheme("Tout"); };
  return <div className={styles.introduction}>
    <EnteteReglages rubrique="aide" titre="Aide">Les réponses à vos questions et vos échanges avec Gerimmo, au même endroit.</EnteteReglages>
    <nav className={styles.raccourcis} aria-label="Sections de l’aide">
      <Link href="#questions-titre"><BookOpen size={17} aria-hidden="true" />Questions fréquentes</Link>
      <Link href={assistance}><MessageCircle size={17} aria-hidden="true" />Contacter Gerimmo</Link>
      <Link href="#mes-demandes"><Inbox size={17} aria-hidden="true" />Mes demandes</Link>
      <Link href="#idees"><Lightbulb size={17} aria-hidden="true" />Les idées</Link>
    </nav>
    <section className={styles.faq} aria-labelledby="questions-titre">
      <div className={styles.enteteQuestions}>
        <div className={styles.titreQuestions}><span className={styles.icone}><BookOpen size={21} aria-hidden="true" /></span><div><h2 id="questions-titre">Questions fréquentes</h2><p>Une réponse rapide pour avancer.</p></div></div>
        <div className={styles.champRecherche}>
        <Search size={19} aria-hidden="true" /><label htmlFor={idRecherche} className="sr-only">Rechercher dans l’aide</label>
        <input id={idRecherche} type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un sujet…" aria-controls="questions-aide" />
        {recherche && <button type="button" aria-label="Effacer la recherche" onClick={() => setRecherche("")}><X size={17} aria-hidden="true" /></button>}
        </div>
      </div>
      <div className={styles.rubriques}>
        <div className={styles.filtres} role="group" aria-label="Rubriques de l’aide">{THEMES.map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}</div>
        <span className={styles.compte} role="status" aria-live="polite">{questions.length} réponse{questions.length > 1 ? "s" : ""}</span>
      </div>
      <div id="questions-aide" className={styles.questions}>
        {questions.map((q) => <details key={q.question} className={styles.question}>
          <summary><span><small>{q.theme}</small><strong>{q.question}</strong></span><ChevronDown size={17} aria-hidden="true" /></summary>
          <div><p>{q.reponse}</p>{q.lien && <Link href={`${base}/${q.lien}`}>Ouvrir {q.lien === "messages" ? "mes messages" : q.lien === "abonnement" ? "mon abonnement" : "mes finances"} <ArrowRight size={14} aria-hidden="true" /></Link>}</div>
        </details>)}
        {questions.length === 0 && <div className={styles.vide}><Search size={28} aria-hidden="true" /><h3>Aucune réponse trouvée</h3><p>Essayez un autre mot-clé ou écrivez-nous pour être accompagné.</p><button type="button" onClick={reinitialiser}>Afficher toutes les questions</button></div>}
      </div>
    </section>

  </div>;
}
