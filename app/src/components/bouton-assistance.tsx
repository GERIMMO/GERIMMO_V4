"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { ecranSansDonnees } from "@/lib/retours";

// LA DERNIÈRE ACTION — ce que faisait la personne avant de demander de l'aide
// (bouton, lien, saisie, envoi), jointe à sa demande. Une seule mémoire pour
// la page (24/09) : l'espace agence porte deux liens d'aide — la barre du
// haut, et le tiroir « Menu » du téléphone qui n'existe qu'une fois ouvert —
// et tous deux doivent rapporter la même chose.
type Action = "navigation" | "bouton" | "lien" | "saisie" | "formulaire";
let derniereAction: Action = "navigation";
const abonnes = new Set<() => void>();

function noter(action: Action) {
  if (action === derniereAction) return;
  derniereAction = action;
  abonnes.forEach((rappel) => rappel());
}
// Un clic sur le chemin de l'aide (`data-assistance` : le lien lui-même, le
// bouton « Menu » qui y mène sur téléphone) ne remplace pas l'action à
// rapporter.
function surClic(event: MouseEvent) {
  const cible = event.target instanceof Element ? event.target : null;
  if (!cible || cible.closest("[data-assistance]")) return;
  if (cible.closest("button")) noter("bouton");
  else if (cible.closest("a")) noter("lien");
}
const surSaisie = () => noter("saisie");
const surEnvoi = () => noter("formulaire");

function abonner(rappel: () => void) {
  if (abonnes.size === 0) {
    document.addEventListener("click", surClic);
    document.addEventListener("input", surSaisie);
    document.addEventListener("submit", surEnvoi);
  }
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
    if (abonnes.size > 0) return;
    document.removeEventListener("click", surClic);
    document.removeEventListener("input", surSaisie);
    document.removeEventListener("submit", surEnvoi);
  };
}

/**
 * LE LIEN « AIDE ET RETOURS », sans habillage : chaque emplacement l'habille
 * (rond flottant, entrée de la barre du haut, ligne du tiroir « Menu »).
 */
export function LienAssistance({
  className,
  title,
  onClick,
  children,
}: {
  className?: string;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const chemin = usePathname();
  const action = useSyncExternalStore(abonner, () => derniereAction, () => "navigation" as Action);
  // `retour` porte le chemin RÉEL pour le seul lien « Retour à la page
  // précédente » de /assistance (24/09) : jamais stocké, relu à travers
  // destinationSure. `ecran`, lui, est anonymisé car il part avec la demande.
  return (
    <Link
      data-assistance
      href={`/assistance?ecran=${encodeURIComponent(ecranSansDonnees(chemin))}&action=${action}&retour=${encodeURIComponent(chemin)}`}
      aria-label="Aide et retours"
      title={title}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

/**
 * Sur téléphone, le rond ne se pose que lorsque le bas de la page est atteint
 * (ou que la page tient dans l'écran) : posé en permanence, il recouvrait le
 * « Déposer › » d'un rang d'attestation et les tuiles de la console (relevé du
 * 25/09, A5 et C33). Le contenu, lui, garde une marge basse qui le loge
 * (`pb-32` du corps artisan, `.bulle-aide-marge` de la console) : au bas de
 * la page, rien n'est dessous. Sur bureau, il vit dans la gouttière et reste
 * toujours visible.
 */
function useBasDePage(): boolean {
  const [auBas, setAuBas] = useState(true);
  useEffect(() => {
    const mesurer = () => {
      const doc = document.documentElement;
      const reste = doc.scrollHeight - (window.scrollY + window.innerHeight);
      setAuBas(reste <= 24);
    };
    mesurer();
    window.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    // Le contenu peut grandir après l'hydratation (listes, dépliages).
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
      observateur.disconnect();
    };
  }, []);
  return auBas;
}

/**
 * Le rond flottant, pour les espaces qui n'ont pas de barre où poser l'aide.
 * Plus dans l'espace agence (24/09) : la pilule masquait le coin bas-droit de
 * chaque page (fin de texte, montants, chevrons, « Ventiler la dépense »),
 * sans moyen de la dégager. L'aide y vit dans la barre du haut et, sur
 * téléphone, dans le tiroir « Menu ».
 */
export function BoutonAssistance() {
  const chemin = usePathname();
  const auBas = useBasDePage();
  const espace = /^\/(artisan|admin|espaces)(\/|$)/.exec(chemin)?.[1];
  if (!espace) return null;
  // Chaque coque a sa place libre (tour du 24/09) :
  // - locataire : PLUS DE ROND (25/09, D40). Sur bureau il recouvrait la carte
  //   « Mon gestionnaire », le choix du créneau et la fin de « Vous quittez le
  //   logement ? » — le contenu du locataire va jusqu'au bord droit. L'aide vit
  //   dans la barre latérale (nav-locataire) et, sur téléphone, dans le tiroir
  //   « Menu » ; le chemin est retiré du filtre ci-dessus ;
  // - artisan : la barre d'onglets est fixe à toutes les largeurs, le bouton
  //   reste au-dessus d'elle (80 px du bas) et ne l'écrase plus sur bureau ;
  // - console : pas de barre basse, le rond tient dans la gouttière à 12 px du
  //   bas, et le libellé n'apparaît qu'aux très grands écrans (colonne de
  //   contenu large).
  const position =
    espace === "admin"
      ? "flex right-3 bottom-3 2xl:size-auto 2xl:min-h-11 2xl:px-4 2xl:right-5 2xl:bottom-5"
      : espace === "artisan"
        ? "flex right-3 bottom-20 sm:size-auto sm:min-h-11 sm:px-4 sm:right-5"
        : "flex right-3 bottom-20 sm:size-auto sm:min-h-11 sm:px-4 sm:right-5 sm:bottom-5";
  const libelle = espace === "admin" ? "hidden 2xl:inline" : "hidden sm:inline";
  // Sous 640 px, tant que le bas de page n'est pas atteint, le rond descend
  // derrière la barre basse (ou sous l'écran) et ne se touche pas.
  const visibilite = auBas
    ? ""
    : "max-sm:translate-y-40 max-sm:opacity-0 max-sm:pointer-events-none";
  return (
    <LienAssistance
      className={`fixed z-30 size-11 items-center justify-center gap-2 rounded-full border border-[var(--filet)] bg-[var(--ivoire)] text-sm font-medium text-[var(--encre)] shadow-sm transition-[transform,opacity] duration-[var(--duree)] hover:border-[var(--or)] motion-reduce:transition-none ${position} ${visibilite}`}
      title={auBas ? undefined : "Aide et retours"}
    >
      {/* Sur téléphone, l'icône seule : le libellé recouvrait des gestes
          (« Régler », « Devis retenu », un champ du signalement — audit du 20/09). */}
      <MessageSquarePlus className="size-4" aria-hidden />
      <span className={libelle}>Aide et retours</span>
    </LienAssistance>
  );
}
