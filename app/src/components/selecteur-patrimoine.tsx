import Link from "next/link";
import { Building2, Check, ChevronDown } from "lucide-react";

/** Des liens ordinaires pour conserver la protection des formulaires modifiés. */
export function SelecteurPatrimoine({ orgId, nom, organisations, indisponible = false }: {
  orgId: string; nom: string; indisponible?: boolean; organisations: { id: string; nom: string }[];
}) {
  const choix = [...new Map([{ id: orgId, nom }, ...organisations].map(o => [o.id, o])).values()];
  // Le contexte n'occupe une ligne que lorsqu'il permet de changer de patrimoine.
  if (choix.length === 1 && !indisponible) return null;
  return <div className="patrimoine-contexte">
    <Building2 size={17} aria-hidden="true" />
    {choix.length > 1 ? <details key={orgId} className="patrimoine-selecteur">
      <summary><span className="sr-only">Patrimoine actif : </span><strong>{nom}</strong><ChevronDown size={15} aria-hidden="true" /></summary>
      <nav aria-label="Changer de patrimoine">{choix.map(o => <Link key={o.id} href={`/espace/${o.id}`} aria-current={o.id === orgId ? "true" : undefined}><span>{o.nom}</span>{o.id === orgId && <Check size={16} aria-hidden="true" />}</Link>)}</nav>
    </details> : <strong>{nom}</strong>}
    {indisponible && <Link className="patrimoine-indisponible" href="/espaces">Autres patrimoines indisponibles · Réessayer</Link>}
  </div>;
}
