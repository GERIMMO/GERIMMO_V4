"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConflitCopieLocale, lireCopieFichiers, modifierCopieFichiers, type CopieFichiers } from "@/lib/brouillon-fichiers";
import { compteDeLaCle, purgerCopiesAutresComptes } from "@/lib/copies-locales";
import { installerGardeCopieLocale, type StatutCopie } from "@/lib/garde-copie-locale";

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
  // Audit du 13/10 (PR178-A-06) : le bouton « Reprendre ma saisie » disparaît avec son bloc et le focus tombait sur le
  // body. Le titre du formulaire repris (`data-titre-reprise`, focalisable) reçoit le focus à la place.
  const deplacerFocus = useRef(false);
  useEffect(() => {
    if (!lecture?.pret || !deplacerFocus.current) return;
    deplacerFocus.current = false;
    document.querySelector<HTMLElement>("[data-titre-reprise]")?.focus({ preventScroll: true });
  }, [lecture]);
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
    <div className="flex flex-wrap gap-3"><button type="button" className="btn-or" onClick={() => { deplacerFocus.current = true; setLecture({ ...lecture, pret: true }); }}>Reprendre ma saisie</button>
    <button type="button" className="btn-secondaire" onClick={() => {
      void modifierCopieFichiers(cle, lecture.copie!.revision, null).then(() => { deplacerFocus.current = true; setLecture({ copie: null, pret: true }); }).catch(() => setLecture({ ...lecture, erreur: "La copie a changé ou ne peut pas être effacée. Rechargez la page pour la vérifier." }));
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
  const [statut, setStatut] = useState<StatutCopie>(initiale ? "conserve" : "vide");
  const differee = useRef<{ donnees: T; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const enregistrer = useCallback((donnees: T | null) => {
    if (termine.current) return Promise.resolve(false);
    // L'enregistrement immédiat est plus récent que la dernière frappe en attente.
    // Celle-ci ne doit pas écraser ensuite le résultat serveur (ex. photos à reprendre).
    if (differee.current) { clearTimeout(differee.current.minuterie); differee.current = null; }
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
  const vider = useCallback(() => {
    const prevue = differee.current;
    if (!prevue) return;
    clearTimeout(prevue.minuterie); differee.current = null;
    void enregistrer(prevue.donnees);
  }, [enregistrer]);
  /**
   * Écrit la copie une fois la frappe terminée (audit du 13/10, PR178-A-04 : une écriture par frappe réécrivait toutes les
   * pièces jointes). Pendant l'attente, le statut passe tout de suite à « attente » : il ne doit pas affirmer « conservés »
   * pour une saisie ou un fichier qui ne l'est pas encore, et la boîte « quitter la page » protège ce délai (constaté au
   * parcours « fiche et justificatif » : fichier ajouté puis onglet fermé avant la fin du délai, copie sans le fichier).
   * La copie est aussi écrite sans attendre quand la page se masque ou que le formulaire se démonte.
   */
  const differer = useCallback((donnees: T) => {
    if (termine.current) return;
    if (differee.current) clearTimeout(differee.current.minuterie);
    setStatut("attente");
    differee.current = { donnees, minuterie: setTimeout(vider, DELAI_COPIE_LOCALE_MS) };
  }, [vider]);
  useEffect(() => {
    const masquee = () => { if (document.visibilityState === "hidden") vider(); };
    document.addEventListener("visibilitychange", masquee);
    window.addEventListener("pagehide", vider);
    return () => { document.removeEventListener("visibilitychange", masquee); window.removeEventListener("pagehide", vider); vider(); };
  }, [vider]);
  // Fermeture d'onglet pendant l'attente, le refus ou le conflit ; lien interne et retour arrière tant que la copie manque
  // (refus, conflit : vérification du 14/10, VFL-03). Voir lib/garde-copie-locale.ts.
  useEffect(() => installerGardeCopieLocale(statut), [statut]);
  return { enregistrer, differer, statut };
}
/**
 * Audit du 13/10 (PR178-A-06) : la région annoncée alternait « Conservation… » et « …conservés » à chaque écriture
 * (25 changements de texte pour 12 caractères). « attente » n'est qu'un passage entre deux états stables : la région
 * annoncée garde l'état stable précédent pendant l'écriture, et ne bouge donc que quand l'état change réellement.
 */
export function statutStableSuivant(stable: StatutCopie, courant: StatutCopie): StatutCopie {
  return courant === "attente" ? stable : courant;
}
function phraseStatut(statut: StatutCopie) {
  return statut === "conflit" ? "Une autre copie a été modifiée dans un autre onglet. Votre saisie reste ici ; gardez cet onglet ouvert et vérifiez l’autre copie avant de quitter."
    : statut === "refuse" ? "Impossible de conserver la copie sur cet appareil. Gardez cet onglet ouvert jusqu’à confirmation de l’enregistrement."
    : statut === "attente" ? "Conservation de votre saisie sur cet appareil…"
    : statut === "conserve" ? "Saisie et fichiers conservés sur cet appareil · non envoyés automatiquement. Se déconnecter efface ces copies ; sinon elles sont effacées à votre première visite après 7 jours. Évitez un appareil partagé."
    : "Votre saisie et vos fichiers seront conservés sur cet appareil pendant ce parcours. Évitez un appareil partagé.";
}
export function StatutCopieLocale({ statut }: { statut: StatutCopie }) {
  const [stable, setStable] = useState<StatutCopie>(statutStableSuivant("vide", statut));
  const suivant = statutStableSuivant(stable, statut);
  if (suivant !== stable) setStable(suivant);
  const erreur = statut === "refuse" || statut === "conflit";
  // Une alerte garde sa région propre (elle doit être dite tout de suite) ; le reste est dit une fois par état stable,
  // dans une région polie masquée à l'œil, le texte visible (y compris « attente ») étant caché au lecteur d'écran.
  // Les clés gardent trois nœuds distincts : un même nœud ne change jamais de rôle, et la région polie reste montée.
  if (erreur) return <>
    <p key="alerte" role="alert" className="mb-3 text-xs text-warning-soft-foreground">{phraseStatut(statut)}</p>
    <p key="annonce" role="status" className="sr-only"></p>
  </>;
  return <>
    <p key="visible" aria-hidden="true" className="mb-3 text-xs text-muted-foreground">{phraseStatut(statut)}</p>
    <p key="annonce" role="status" className="sr-only">{phraseStatut(suivant)}</p>
  </>;
}
