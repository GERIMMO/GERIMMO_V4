"use client";
import { useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { offrirMois, type EtatMoisOfferts } from "@/app/actions/mois-offerts";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function OffrirMoisAbonnement({ compte, espaces, reprise, confirmationId }: { compte: string; confirmationId: string; espaces: { id: string; nom: string }[]; reprise?: { id: string; mois: number; motif: string; montant_cents: number; organisation: string } }) {
 const [id] = useState(() => reprise?.id ?? confirmationId);
 const [etat, envoyer] = useActionState<EtatMoisOfferts, FormData>(offrirMois.bind(null, compte), {});
 const [modifie, setModifie] = useState(false);
 const [organisation, setOrganisation] = useState(reprise?.organisation ?? espaces[0]?.id ?? "");
 const [mois, setMois] = useState(String(reprise?.mois ?? 1));
 const [motif, setMotif] = useState(reprise?.motif ?? "Geste commercial");
 const apercu = modifie ? undefined : etat.apercu ?? (reprise ? { nature: "credit", reactivation: false, montant_cents: reprise.montant_cents } : undefined);
 const champ = "mt-1 w-full rounded-lg border border-[var(--filet)] bg-white p-3";
 if (etat.succes) return <p role="status" className="rounded-xl bg-[var(--success-bg)] p-4 text-[var(--success)]">{etat.succes}</p>;
 return <form action={f => { setModifie(false); envoyer(f); }} data-saisie-confirmee className="space-y-4">
  <input type="hidden" name="cadeau" value={id}/>
  <label className="block text-sm">Espace bénéficiaire<select name="organisation" value={organisation} required className={champ} onChange={e => { setOrganisation(e.target.value); setModifie(true); }}>
   {espaces.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
  </select></label>
  <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
   <label className="block text-sm">Mois offerts<input name="mois" type="number" min={1} max={12} value={mois} required className={champ} onChange={e => { setMois(e.target.value); setModifie(true); }}/></label>
   <label className="block text-sm">Motif interne<input name="motif" value={motif} minLength={5} maxLength={500} placeholder="Ex. compensation après un bug" required className={champ} onChange={e => { setMotif(e.target.value); setModifie(true); }}/></label>
  </div>
  {apercu && <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4 text-sm" role="status">
   {apercu.nature === "acces" ? <p>{apercu.reactivation ? "Accès réactivé et offert jusqu’au" : "Accès offert jusqu’au"} <b>{apercu.fin?.split("-").reverse().join("/")}</b>. Le temps restant est conservé. Aucun prélèvement automatique à la fin.</p>
    : <p><b>{((apercu.montant_cents ?? 0)/100).toFixed(2).replace(".",",")} € offerts</b> au tarif actuel, déduits des prochaines factures. Aucun remboursement des paiements passés. Les factures déjà émises restent inchangées.</p>}
   <input type="hidden" name="apercu" value={JSON.stringify(apercu)}/>
   <label className="mt-3 flex min-h-11 items-center gap-2"><input name="confirmation" value="oui" type="checkbox" required className="size-5"/>Je confirme ce cadeau.</label>
  </div>}
  <BoutonEnvoi enCoursTexte="Vérification…">{apercu ? "Confirmer les mois offerts" : "Vérifier le cadeau"}</BoutonEnvoi>
  {etat.erreur && <p role="alert" className="text-sm text-[var(--destructive)]">{etat.erreur}</p>}
 </form>;
}
