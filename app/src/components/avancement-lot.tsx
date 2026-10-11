import type { avancementLot } from "@/lib/avancement-lot";

export function AvancementLot({ avancement, nom }: { avancement: ReturnType<typeof avancementLot>; nom: string }) {
  if (!avancement) return <span className="mt-3 block text-xs text-muted-foreground">Avancement indisponible</span>;
  const { faits, total, pourcentage, prochain } = avancement;
  return <span className="mt-3 block border-t border-border pt-3">
    <span className="mb-2 flex items-center justify-between gap-3 text-xs"><span>Dossier du lot</span><strong className={faits === total ? "text-success-soft-foreground" : "text-warning-soft-foreground"}>{pourcentage} %</strong></span>
    <span role="progressbar" aria-label={`Avancement du dossier de ${nom}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={faits} aria-valuetext={`${faits} rubrique${faits > 1 ? "s" : ""} sur ${total} renseignée${faits > 1 ? "s" : ""}`} className="block h-1.5 overflow-hidden rounded-full bg-[var(--filet-leger)]"><span className="block h-full rounded-full" style={{ width: `${pourcentage}%`, background: faits === total ? "var(--success)" : "var(--or)" }} /></span>
    <span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{faits}/{total} rubriques renseignées{prochain ? ` · À compléter : ${prochain.titre.toLowerCase()}` : ""}</span>
  </span>;
}
