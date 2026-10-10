"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Modale } from "@/components/ui/modale";
import { BoutonLot } from "@/components/fenetre-lot";
import { buttonVariants } from "@/components/ui/button";
import { TYPES_BIEN, formaterSurface } from "@/lib/parc";

type BienResume = {
  id: string; nom: string; type: string; address_line1: string;
  postal_code: string; city: string; archived_at: string | null;
  lots: { id: string; nom: string; etat: string; surface_m2: number | null }[];
};

/** Le lot unique garde sa fenêtre métier ; un bien sans lot reste consultable. */
export function BoutonResumeBien({ orgId, bien, className, children }: {
  orgId: string; bien: BienResume; className?: string; children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const href = `/agence/${orgId}/parc/${bien.id}`;
  const lots = bien.lots.filter(l => l.etat !== "archive");
  const consultables = lots.length ? lots : bien.lots;
  if (consultables.length === 1) {
    const lot = consultables[0];
    return <BoutonLot lotId={lot.id} libelle={`${bien.nom} · ${lot.nom}`} href={`${href}/lots/${lot.id}`} className={className}>{children}</BoutonLot>;
  }
  return <>
    <button type="button" onClick={() => setOuvert(true)} className={className}>{children}</button>
    {ouvert && <Modale tresLarge titre={bien.nom} fermer={() => setOuvert(false)}
      entete={<div className="min-w-0"><p className="mono-discret">{TYPES_BIEN[bien.type] ?? bien.type} · {bien.city}</p><h3 className="mt-1">{bien.nom}</h3><p className="mt-1 text-sm text-muted-foreground">{bien.address_line1}, {bien.postal_code} {bien.city}</p>{bien.archived_at && <span className="puce puce-grise mt-2">Retiré du parc</span>}</div>}
      pied={<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setOuvert(false)} className={buttonVariants({variant:"outline",size:"sm"})}>Fermer</button><Link href={href} className={buttonVariants({size:"sm"})}>Ouvrir la fiche complète</Link></div>}>
      <div className="columns-1 gap-3 sm:columns-2">
        <section className="mb-3 break-inside-avoid rounded-xl border border-[var(--filet)] bg-[var(--carte)] p-3"><h4 className="mb-2 font-semibold">Informations du bien</h4><p className="text-sm">{TYPES_BIEN[bien.type] ?? bien.type}</p><dl className="mt-2 space-y-1 text-[13px]"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Adresse</dt><dd className="min-w-0 text-right break-words">{bien.address_line1}, {bien.postal_code} {bien.city}</dd></div>{["Surface", "Étage", "Nombre de pièces", "DPE"].map(champ => <div key={champ} className="flex justify-between gap-3"><dt className="text-muted-foreground">{champ}</dt><dd className="text-right">{consultables.length ? "À consulter par lot" : "Non renseigné"}</dd></div>)}</dl><p className="mt-2 text-sm text-muted-foreground">{lots.length} lot{lots.length > 1 ? "s" : ""} actif{lots.length > 1 ? "s" : ""}</p></section>
        <section className="mb-3 break-inside-avoid rounded-xl border border-[var(--filet)] bg-[var(--carte)] p-3"><h4 className="mb-2 font-semibold">Locataire</h4><p className="text-sm text-muted-foreground">{lots.length ? "Les locataires sont consultables dans le détail de chaque lot." : "Aucun locataire dans un lot actif."}</p></section>
        <section className="mb-3 break-inside-avoid rounded-xl border border-[var(--filet)] bg-[var(--carte)] p-3"><h4 className="mb-2 font-semibold">Garants</h4><p className="text-sm text-muted-foreground">{lots.length ? "Les garants sont consultables dans le détail de chaque lot." : "Aucun garant dans un lot actif."}</p></section>
        <section className="mb-3 break-inside-avoid rounded-xl border border-[var(--filet)] bg-[var(--carte)] p-3"><h4 className="mb-2 font-semibold">Contrat de location</h4><p className="text-sm text-muted-foreground">{lots.length ? "Retrouvez les contrats dans la fiche de chaque lot." : "Aucun lot actif à mettre en location."}</p></section>
      </div>
      {consultables.length > 0 && <section><h4 className="mb-2 font-semibold">Lots du bien</h4>{consultables.map(lot => <Link key={lot.id} href={`${href}/lots/${lot.id}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm">{lot.nom}<span className="text-muted-foreground">{lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : "Surface non renseignée"} →</span></Link>)}</section>}
      <section><p className="eyebrow mb-2">Actions rapides</p><div className="flex flex-wrap gap-2"><Link href={href} className={buttonVariants({variant:"outline",size:"sm"})}>Gérer le bien</Link><Link href={`${href}#diagnostics`} className={buttonVariants({variant:"outline",size:"sm"})}>Voir les diagnostics</Link><Link href={`/agence/${orgId}/reseau?bien=${bien.id}`} className={buttonVariants({variant:"outline",size:"sm"})}>Trouver un artisan</Link></div></section>
    </Modale>}
  </>;
}
