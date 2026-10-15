import {euros} from "../libelles";
import {MESSAGE_FACTURE_DEFINITIVE,type ResumeRelectureFacture} from "@/lib/artisan-prive-facture";

// D24-B (ARC-07, ARC-04) : l'écran de relecture avant le dépôt d'une facture externe. Une facture déposée est définitive :
// l'artisan relit ici ce qui sera enregistré (numéro, total TTC, écart avec le devis, pièce). Le résumé vient de
// resumerFacture (lib/artisan-prive-facture.ts), qui lit le montant comme l'action serveur. Composant sans état :
// les boutons « Modifier la saisie » et « Confirmer » appartiennent au formulaire.
export function RelectureFacture({resume}:{resume:ResumeRelectureFacture}){
 const ecart=resume.ecartCents;
 const lignes:[string,string][]=[
  ["Numéro de la facture",resume.numero||"—"],
  ["Montant TTC",resume.montantCents===null?"—":euros(resume.montantCents)],
 ];
 if(resume.devisTtcCents!==null)lignes.push(["Devis accepté",euros(resume.devisTtcCents)]);
 if(ecart!==null&&ecart!==0){
  lignes.push(["Écart avec le devis accepté",`${ecart>0?"supérieur":"inférieur"} de ${euros(Math.abs(ecart))}`]);
  if(resume.justification)lignes.push(["Justification de l’écart",resume.justification]);
 }
 lignes.push(["Pièce jointe",resume.piece?`${resume.piece.nom} · ${resume.piece.taille}`:"Aucune pièce"]);
 return <div className="space-y-4 rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-4">
  <h3 className="text-[1.0625rem] font-medium text-[var(--encre)]">Relisez votre facture avant de la déposer</h3>
  <p>{MESSAGE_FACTURE_DEFINITIVE}</p>
  <dl className="grid gap-3 sm:grid-cols-2">{lignes.map(([libelle,valeur])=><div key={libelle} className="min-w-0 rounded-xl border border-[var(--filet)] p-3"><dt className="text-sm text-[var(--texte-secondaire)]">{libelle}</dt><dd className="mt-1 break-words font-semibold text-[var(--encre)]">{valeur}</dd></div>)}</dl>
  {resume.alertes.length>0&&<ul role="alert" className="list-disc space-y-1 pl-5 text-[var(--destructive)]">{resume.alertes.map(a=><li key={a}>{a}</li>)}</ul>}
 </div>;
}
