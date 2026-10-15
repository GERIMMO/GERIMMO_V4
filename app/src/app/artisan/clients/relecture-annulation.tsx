import {euros} from "../libelles";
import {MESSAGE_ANNULATION_CONSEQUENCES,type ResumeAnnulationFacture} from "@/lib/artisan-prive-avoir";

// D24-C (ARC-07) : le second temps de l'annulation d'une facture externe. L'artisan relit ce qui sera enregistré (la facture
// annulée, le montant de l'avoir, le motif) et ce que l'annulation entraîne, avant de confirmer. Le résumé vient de
// resumerAnnulation (lib/artisan-prive-avoir.ts). Composant sans état : « Modifier la saisie » et « Confirmer » appartiennent au formulaire.
export function RelectureAnnulation({resume}:{resume:ResumeAnnulationFacture}){
 const lignes:[string,string][]=[
  ["Facture annulée",resume.numero],
  ["Montant de l’avoir (TTC)",euros(resume.montantCents)],
  ["Motif de l’annulation",resume.motif||"—"],
 ];
 return <div className="space-y-4 rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-4">
  <h3 className="text-[1.0625rem] font-medium text-[var(--encre)]">Relisez l’annulation avant de la confirmer</h3>
  <p>{MESSAGE_ANNULATION_CONSEQUENCES}</p>
  <dl className="grid gap-3 sm:grid-cols-2">{lignes.map(([libelle,valeur])=><div key={libelle} className="min-w-0 rounded-xl border border-[var(--filet)] p-3"><dt className="text-sm text-[var(--texte-secondaire)]">{libelle}</dt><dd className="mt-1 break-words font-semibold text-[var(--encre)]">{valeur}</dd></div>)}</dl>
  {resume.alertes.length>0&&<ul role="alert" className="list-disc space-y-1 pl-5 text-[var(--destructive)]">{resume.alertes.map(a=><li key={a}>{a}</li>)}</ul>}
 </div>;
}
