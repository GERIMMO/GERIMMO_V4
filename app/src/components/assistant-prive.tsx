"use client";

import { useId, useRef, useState } from "react";
import { preparerSoumission, confirmerSoumission } from "@/lib/protection-saisie";
import { ChevronDown, LockKeyhole, Send, Sparkles, Trash2 } from "lucide-react";
import { demanderAssistantPrive } from "@/app/actions/conversation-privee";
import { SUJETS_ASSISTANT, type MessageAssistant, type SujetAssistant } from "@/lib/conversation-privee";
import { BoutonEnvoi } from "./ui/bouton-envoi";

export function AssistantPrive({ orgId, compteId, lectureSeule = false }: { orgId: string; compteId: string; lectureSeule?: boolean }) {
  const id = useId();
  const verrou = useRef(false);
  const [messages, setMessages] = useState<MessageAssistant[]>([]);
  const [question, setQuestion] = useState("");
  const [sujet, setSujet] = useState<SujetAssistant>("general");
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState("");
  async function envoyer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verrou.current || !question.trim()) return;
    verrou.current = true; setAttente(true); setErreur("");
    const texte = question.trim();
    const formulaire = event.currentTarget;
    const donnees = new FormData(formulaire);
    preparerSoumission(formulaire, donnees);
    try {
      // Les échanges les plus anciens restent visibles mais ne sont plus transmis.
      let historique = messages.slice(-12);
      while (historique.reduce((n, m) => n + m.content.length, texte.length) > 24000) historique = historique.slice(2);
      const resultat = await demanderAssistantPrive(orgId, compteId, { sujet, question: texte, historique });
      if (resultat.reponse) { confirmerSoumission(donnees); formulaire.reset(); setMessages([...messages, { role: "user", content: texte }, { role: "assistant", content: resultat.reponse }]); setQuestion(""); }
      else setErreur(resultat.erreur || "La réponse est indisponible.");
    } catch { setErreur("La connexion a été interrompue. Votre question est conservée ; vous pouvez réessayer."); }
    finally { verrou.current = false; setAttente(false); }
  }
  return <details className="group mb-5 rounded-2xl border bg-card p-4 sm:p-5">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      <Sparkles size={20} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1"><strong className="block text-sm">Demander à Gerimmo</strong><span className="text-xs text-muted-foreground">Une question sur vos démarches ?</span></span>
      <LockKeyhole size={15} aria-label="Conversation privée" className="shrink-0 text-muted-foreground" />
      <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
    </summary>
    <div className="mt-4 space-y-4 border-t pt-4">
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">Échange privé entre vous et Gerimmo, conservé dans cette page jusqu’à son rechargement. Seuls vos messages et le sujet choisi sont transmis à l’IA. Aucun dossier n’est joint automatiquement.</p>
      <p className="text-xs text-muted-foreground">Évitez les données personnelles de tiers. Gerimmo vous conseille sans agir à votre place.</p>
      {messages.length > 0 && <>
        <ol className="max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain rounded-xl border p-3" aria-label="Votre échange privé avec Gerimmo" aria-live="polite" aria-relevant="additions">
          {messages.map((m, i) => <li key={i} className={`rounded-xl p-3 text-sm ${m.role === "user" ? "ml-4 bg-muted" : "mr-4 border"}`}><strong className="mb-1 block text-xs">{m.role === "user" ? "Vous" : "Gerimmo · IA"}</strong><p className="whitespace-pre-wrap wrap-anywhere leading-relaxed">{m.content}</p></li>)}
        </ol>
        <button type="button" disabled={attente} onClick={() => { setMessages([]); setErreur(""); }} className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><Trash2 size={14} aria-hidden="true" />Effacer l’échange</button>
      </>}
      {lectureSeule ? <p className="text-sm text-muted-foreground">L’assistant est disponible avec un accès actif à cet espace.</p> : <form data-saisie-confirmee onSubmit={envoyer} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><label htmlFor={`${id}-sujet`} className="text-sm">Sujet</label><select name="sujet" id={`${id}-sujet`} value={sujet} disabled={attente} onChange={e => setSujet(e.target.value as SujetAssistant)} className="min-h-11 max-w-full rounded-lg border bg-background px-3 text-sm">{Object.entries(SUJETS_ASSISTANT).map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}</select></div>
        <label htmlFor={`${id}-question`} className="block text-sm font-medium">Votre question</label>
        <textarea name="question" id={`${id}-question`} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} rows={3} required disabled={attente} placeholder="Par exemple : comment préparer une régularisation de charges ?" className="w-full resize-y rounded-xl border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" aria-describedby={`${id}-notice`} />
        <div className="flex flex-wrap items-center justify-between gap-3"><span id={`${id}-notice`} className="text-xs text-muted-foreground">Réponse assistée à vérifier avant toute décision.</span><BoutonEnvoi enCours={attente} enCoursTexte="Gerimmo prépare sa réponse…" disabled={!question.trim()} className="btn-or min-h-11 disabled:opacity-60"><Send size={15} aria-hidden="true" />Envoyer à Gerimmo</BoutonEnvoi></div>
        {erreur && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{erreur}</p>}
        {attente && <p role="status" className="text-xs text-muted-foreground">Votre question est en cours de traitement.</p>}
      </form>}
    </div>
  </details>;
}
