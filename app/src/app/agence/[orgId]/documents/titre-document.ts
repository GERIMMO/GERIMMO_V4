import { formaterDate } from "@/lib/ged";

// Les diagnostics déposés avant le 24/09 portent un titre terminé par la date
// ISO de réalisation (« DPE — 2026-09-24 ») ; les nouveaux dépôts écrivent
// déjà la date à la française. La base reste telle quelle : c'est à
// l'affichage qu'on réécrit cette fin (« DPE — 24/09/2026 »). Tout autre
// titre est rendu tel quel.
const FIN_ISO = /^(.*) — (\d{4}-\d{2}-\d{2})$/;

export function titreAffiche(titre: string | null | undefined): string | null {
  if (!titre) return null;
  const m = FIN_ISO.exec(titre);
  if (!m) return titre;
  const date = formaterDate(m[2]);
  // Date invalide (« 2026-13-45 ») : formaterDate rend « Invalid Date » —
  // on garde alors le titre d'origine plutôt qu'un affichage cassé.
  return /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? `${m[1]} — ${date}` : titre;
}
