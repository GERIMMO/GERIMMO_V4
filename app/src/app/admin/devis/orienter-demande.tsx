"use client";

import { useId, useState } from "react";
import Link from "next/link";

/** Qualification humaine avant toute ouverture commerciale, sans déduire l'intention du message. */
export function OrienterDemande({ id }: { id: string }) {
  const champ = useId();
  const [nature, setNature] = useState("");
  return <div className="w-full space-y-3 rounded-lg border border-[var(--filet)] p-3">
    <label htmlFor={champ} className="block text-sm font-medium">Quelle suite donner à cette demande ?</label>
    <select id={champ} value={nature} onChange={e => setNature(e.target.value)} className="champ w-full sm:max-w-sm">
      <option value="">Choisir après lecture du message</option>
      <option value="commercial">Ouverture d’un espace client</option>
      <option value="assistance">Aide à un utilisateur existant</option>
      <option value="confidentialite">Données personnelles et confidentialité</option>
      <option value="autre">Autre demande de contact</option>
    </select>
    {nature === "commercial" && <div className="space-y-2"><p className="text-sm">Qualifiez le besoin et préparez la prochaine action. Créer une fiche prospect n’envoie aucune invitation.</p><Link href={`/admin/territoire/prospects/nouveau?demande=${id}`} className="btn-or">Créer le suivi commercial</Link></div>}
    {nature === "assistance" && <p className="text-sm">Retrouvez son espace dans <Link href="/admin/clients" className="underline">l’annuaire</Link> ou consultez <Link href="/admin/retours" className="underline">l’assistance clients</Link>. Aucun nouvel espace n’est nécessaire.</p>}
    {nature === "confidentialite" && <p className="text-sm">Vérifiez l’identité et la portée de la demande avant de traiter les données. Retrouvez le compte dans <Link href="/admin/clients" className="underline">l’annuaire</Link> et les contrôles dans <Link href="/admin/securite" className="underline">Sécurité et conformité</Link>.</p>}
    {nature === "autre" && <p className="text-sm">Répondez au demandeur avec les coordonnées de sa fiche, puis marquez la demande traitée lorsque la réponse a été apportée.</p>}
  </div>;
}
