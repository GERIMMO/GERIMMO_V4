"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConflitCopieLocale, lireCopieFichiers, modifierCopieFichiers, type CopieFichiers } from "@/lib/brouillon-fichiers";
import { compteDeLaCle, purgerCopiesAutresComptes } from "@/lib/copies-locales";

/** Délai après la dernière frappe avant d'écrire la copie locale (audit du 13/10, PR178-A-04). */
export const DELAI_COPIE_LOCALE_MS = 500;

/**
 * Le formulaire dit à RepriseLocale que son envoi est confirmé (audit du 13/10, VER-PR178-03) : l'alerte de lecture
 * « La copie sur cet appareil est indisponible. Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement. »
 * n'a plus d'objet une fois l'enregistrement confirmé, et restait pourtant affichée tant que la page était montée.
 */
const EnvoiConfirme = createContext<(() => void) | null>(null);

export function RepriseLocale<T>({ cle, valider, children }: {
  cle: string; valider: (donnees: unknown) => T | null;
  children: (copie: CopieFichiers<T> | null) => ReactNode;
}) {
  const [lecture, setLecture] = useState<{ copie: CopieFichiers<T> | null; pret: boolean; erreur?: string } | null>(null);
  const [confirme, setConfirme] = useState(false);
  const signalerConfirmation = useCallback(() => setConfirme(true), []);
  useEffect(() => {
    let actif = true;
    const compte = compteDeLaCle(cle);
    if (compte) purgerCopiesAutresComptes(compte);
    void lireCopieFichiers(cle).then(async copie => {
      const donnees = copie && valider(copie.donnees);
      if (copie && !donnees) await modifierCopieFichiers(cle, copie.revision, null);
      if (actif) setLecture({ copie: copie && donnees ? { ...copie, donnees } : null, pret: !donnees });
    }).catch(() => { if (actif) setLecture({ copie: null, pret: true, erreur: "La copie sur cet appareil est indisponible. Gardez cet onglet ouvert jusqu’à confirmation de l’enregistrement." }); });
    return () => { actif = false; };
  }, [cle, valider]);
  if (!lecture) return <p role="status" className="text-sm text-muted-foreground">Recherche d’une saisie à reprendre…</p>;
  if (!lecture.pret && lecture.copie) return <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3" aria-label="Saisie à reprendre">
    <h2 className="font-semibold text-lg">Reprendre votre saisie</h2>
    <p className="text-sm">Une copie du {new Date(lecture.copie.date).toLocaleString("fr-FR")} est disponible sur cet appareil, avec ses fichiers. Rien ne sera envoyé sans votre action.</p>
    {lecture.erreur && <p role="alert">{lecture.erreur}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" className="btn-or" onClick={() => setLecture({ ...lecture, pret: true })}>Reprendre ma saisie</button>
    <button type="button" className="btn-secondaire" onClick={() => {
      void modifierCopieFichiers(cle, lecture.copie!.revision, null).then(() => setLecture({ copie: null, pret: true })).catch(() => setLecture({ ...lecture, erreur: "La copie a changé ou ne peut pas être effacée. Rechargez la page pour la vérifier." }));
    }}>Effacer cette copie</button></div>
  </section>;
  return <EnvoiConfirme.Provider value={signalerConfirmation}>
    {lecture.erreur && !confirme && <p role="alert" className="mb-3 text-sm text-warning-soft-foreground">{lecture.erreur}</p>}{children(lecture.copie)}
  </EnvoiConfirme.Provider>;
}

export function useCopieFichiers<T>(cle: string, initiale: CopieFichiers<T> | null) {
  const revision = useRef(initiale?.revision ?? null);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const termine = useRef(false);
  const attente = useRef(0);
  const signalerConfirmation = useContext(EnvoiConfirme);
  const [statut, setStatut] = useState<"vide" | "attente" | "conserve" | "refuse" | "conflit">(initiale ? "conserve" : "vide");
  const enregistrer = useCallback((donnees: T | null) => {
    if (termine.current) return Promise.resolve(false);
    attente.current++; setStatut("attente");
    const suite = file.current.then(async () => {
      if (termine.current) return false;
      try {
        const copie = await modifierCopieFichiers(cle, revision.current, donnees);
        revision.current = copie?.revision ?? null;
        if (donnees === null) { termine.current = true; signalerConfirmation?.(); }
        if (attente.current === 1) setStatut(donnees === null ? "vide" : "conserve");
        return true;
      } catch (erreur) {
        // Audit du 13/10 (PR178-A-08) : après un envoi CONFIRMÉ, une copie qu'on ne peut pas effacer (stockage refusé) ne
        // doit laisser ni l'alerte ni la boîte « quitter la page » : il n'y a plus rien à conserver.
        if (donnees === null && !(erreur instanceof ConflitCopieLocale)) { termine.current = true; setStatut("vide"); signalerConfirmation?.(); return false; }
        setStatut(erreur instanceof ConflitCopieLocale ? "conflit" : "refuse");
        return false;
      } finally { attente.current--; }
    });
    file.current = suite;
    return suite;
  }, [cle, signalerConfirmation]);
  useEffect(() => {
    const avertir = (e: BeforeUnloadEvent) => {
      if (statut === "attente" || statut === "refuse" || statut === "conflit") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [statut]);
  return { enregistrer, statut };
}
export function StatutCopieLocale({ statut }: { statut: ReturnType<typeof useCopieFichiers>["statut"] }) {
  const erreur = statut === "refuse" || statut === "conflit";
  return <p role={erreur ? "alert" : "status"} className={`mb-3 text-xs ${erreur ? "text-warning-soft-foreground" : "text-muted-foreground"}`}>
    {statut === "conflit" ? "Une autre copie a été modifiée dans un autre onglet. Votre saisie reste ici ; gardez cet onglet ouvert et vérifiez l’autre copie avant de quitter."
      : statut === "refuse" ? "Impossible de conserver la copie sur cet appareil. Gardez cet onglet ouvert jusqu’à confirmation de l’enregistrement."
      : statut === "attente" ? "Conservation de votre saisie sur cet appareil…"
      : statut === "conserve" ? "Saisie et fichiers conservés sur cet appareil · non envoyés automatiquement. Se déconnecter efface ces copies ; sinon elles sont effacées à votre première visite après 7 jours. Évitez un appareil partagé."
      : "Votre saisie et vos fichiers seront conservés sur cet appareil pendant ce parcours. Évitez un appareil partagé."}
  </p>;
}
