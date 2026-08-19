// Badge de statut — charte graphique GERIMMO v2, section 04 :
// « Texte coloré, sans pastille ni fond. Alignés à droite de la ligne. »
// IBM Plex Mono 9,5 px, capitales, interlettrage 0,12em.
//
// Les quatre tons correspondent aux couleurs de statut de la charte :
//   ok      #4F7A52  à jour, encaissé, signé, valide
//   attente #A8791F  en attente, relance, bientôt échu
//   retard  #A2453B  retard, impayé, manquant, expiré
//   neutre           information sans enjeu (brouillon, hors obligation)

export type TonStatut = "ok" | "attente" | "retard" | "neutre";

const TONS: Record<TonStatut, string> = {
  ok: "text-success-soft-foreground",
  attente: "text-warning-soft-foreground",
  retard: "text-destructive",
  neutre: "text-muted-foreground",
};

export function BadgeStatut({
  ton = "neutre",
  children,
  className = "",
}: {
  ton?: TonStatut;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge-statut shrink-0 ${TONS[ton]} ${className}`}>
      {children}
    </span>
  );
}
