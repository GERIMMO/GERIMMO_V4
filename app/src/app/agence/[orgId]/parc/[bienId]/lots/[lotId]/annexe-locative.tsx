"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { rattacherAnnexeLocative, type EtatAnnexeLocative } from "@/app/actions/annexes-locatives";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function AnnexeLocative({ orgId, bienId, lotId, principal, candidats }: {
  orgId: string; bienId: string; lotId: string; principal: string | null; candidats: { id: string; nom: string }[];
}) {
  const [etat, action] = useActionState<EtatAnnexeLocative, FormData>(rattacherAnnexeLocative.bind(null, orgId, bienId, lotId), {});
  const [choix, setChoix] = useState(principal ?? "");
  return <details className="rounded-xl border p-3">
    <summary className="cursor-pointer font-medium">Logement indépendant ou annexe du même bail</summary>
    <form action={action} className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">Un parking loué séparément compte pour un bien. Une annexe louée avec un logement dans le même bail se rattache à ce logement. Ce rattachement est refusé si l’annexe porte déjà un bail distinct en cours.</p>
      <label className="block text-sm" htmlFor="annexe-logement">Rattachement locatif</label>
      <select id="annexe-logement" name="principal" value={choix} onChange={e=>setChoix(e.target.value)} className="w-full rounded-lg border bg-background p-2">
        <option value="">Lot indépendant, avec son propre bail</option>
        {candidats.map(c=><option key={c.id} value={c.id}>Annexe du logement : {c.nom}</option>)}
      </select>
      <label className="flex items-start gap-2 text-sm"><input name="confirmation" value="oui" required type="checkbox" className="mt-1" />
        <span>{choix ? "Je confirme que cette annexe est louée avec le logement choisi, dans le même bail, et non séparément." : "Je confirme que ce lot est indépendant. Une capacité supplémentaire peut être nécessaire pour le gérer séparément."}</span></label>
      <BoutonEnvoi enCoursTexte="Vérification du rattachement…">Enregistrer le rattachement</BoutonEnvoi>
      {etat.erreur && <div role="alert" className="text-sm text-destructive"><p>{etat.erreur}</p><Link href={`/agence/${orgId}/abonnement`} className="underline">Consulter ma capacité et le tarif avant tout changement</Link></div>}
      {etat.succes && <p role="status" className="text-sm">{etat.succes}</p>}
    </form>
  </details>;
}
