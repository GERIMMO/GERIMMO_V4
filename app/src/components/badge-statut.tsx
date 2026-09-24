// Badge de statut : texte coloré, sans pastille ni fond, aligné à droite de
// la ligne, dans la métrique commune des libellés (11 px, capitales). Quand un
// statut appelle un geste, préférer la puce (`components/ui/statut.tsx`).
//
// Les quatre tons suivent les jetons d'état de la charte :
//   ok       à jour, encaissé, signé, valide
//   attente  en attente, relance, bientôt échu
//   retard   retard, impayé, manquant, expiré
//   neutre   information sans enjeu (brouillon, hors obligation)

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
