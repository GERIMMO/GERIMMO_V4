"use client";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { preparerRegularisationFournitures, emettreRegularisationFournitures, type EtatRegularisationFournitures } from "@/app/actions/regularisation-fournitures";
import type { BrouillonRegularisationFourniture } from "@/lib/regularisation-fournitures";
import { eur, formaterDate } from "@/lib/ged";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { ApercuDocumentEspace } from "./apercu-document-espace";

type EtatEmission = EtatRegularisationFournitures & { brouillonId?: string; empreinte?: string };

export function RegularisationFournitures({ orgId, bailId, annee, aujourdhui, base, onAnneeChange }: { orgId: string; bailId: string; annee: number; aujourdhui: string; base: string; onAnneeChange: (annee: string) => void }) {
  const [etat, submit, pending] = useActionStateProtegee(preparerRegularisationFournitures.bind(null, orgId, bailId), {} as EtatRegularisationFournitures);
  const d = etat.brouillon?.annee === annee ? etat.brouillon : undefined;
  const [emission, emettre, emissionPending] = useActionStateProtegee(async (_: EtatEmission, form: FormData): Promise<EtatEmission> => {
    if (!d) return { erreur: "Préparez le décompte de cet exercice avant de le valider." };
    const resultat = await emettreRegularisationFournitures(orgId, bailId, d.id, {}, form);
    return { ...resultat, brouillonId: d.id, empreinte: d.empreinte };
  }, {} as EtatEmission);
  const resultatEmission = d && emission.brouillonId === d.id && emission.empreinte === d.empreinte ? emission : {};
  const valide = Boolean(resultatEmission.succes);
  return <details id="regularisation-fournitures" className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-muted/25 p-3">
    <summary className="cursor-pointer text-sm font-medium">Utiliser les factures déjà réparties</summary>
    <form data-saisie-confirmee action={submit} className="flex flex-wrap items-end gap-3"><label className="text-sm">Année<input name="annee" type="number" min="1970" max={Number(aujourdhui.slice(0,4))} required disabled={pending || emissionPending} value={Number.isInteger(annee) ? annee : ""} onChange={e => onAnneeChange(e.target.value)} className="ml-2 w-24 rounded-md border border-input bg-background p-2" /></label>{!valide && <BoutonEnvoi variant="outline" enCours={pending} disabled={emissionPending} enCoursTexte="Calcul…">{d ? "Recalculer avec les dernières factures" : "Préparer depuis les factures"}</BoutonEnvoi>}</form>
    <p className="text-xs text-muted-foreground">Exercice {annee} · les parts validées et les provisions du bail sont reprises automatiquement.</p>
    {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {d && <div className="space-y-3"><p className="text-sm font-semibold">{valide ? "Régularisation validée" : "Brouillon à vérifier"} · {d.annee}</p>
      <ul className="space-y-2 text-sm">{d.source.factures.map(x => <li key={x.repartition_id} className="flex flex-wrap items-center justify-between gap-2"><span>{x.fournisseur} · {x.reference}<span className="block text-xs text-muted-foreground">{formaterDate(x.debut)} – {formaterDate(x.fin)}</span></span><strong>{eur(Number(x.montant_cents) / 100)}</strong></li>)}</ul>
      <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm"><dt>Charges réelles</dt><dd className="text-right">{eur(Number(d.source.charges_reelles))}</dd><dt>Provisions appelées</dt><dd className="text-right">{eur(Number(d.source.provisions))}</dd><dt className="font-medium">{Number(d.source.ecart) >= 0 ? "En faveur du locataire" : "Complément"}</dt><dd className="text-right font-semibold">{eur(Math.abs(Number(d.source.ecart)))}</dd></dl>
      <p className="text-xs text-muted-foreground">Les parts tiennent déjà compte de l’occupation et de la colocation. Les impayés de provisions restent suivis séparément dans les loyers.</p>
      <Emission key={`${d.id}:${d.empreinte}`} d={d} aujourdhui={aujourdhui} base={base} etat={resultatEmission} submit={emettre} pending={emissionPending} />
    </div>}
  </details>;
}
function Emission({ d, aujourdhui, base, etat, submit, pending }: { d: BrouillonRegularisationFourniture; aujourdhui: string; base: string; etat: EtatRegularisationFournitures; submit: (form: FormData) => void; pending: boolean }) {
  if (etat.succes) return <div className="space-y-2"><p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>{etat.documentId && <ApercuDocumentEspace fichier={`${base}/documents/${etat.documentId}/fichier`} titre={`Décompte de charges ${d.annee}`} />}</div>;
  const enCours = `${d.annee}-12-31` >= aujourdhui;
  const tardive = aujourdhui > `${d.annee + 1}-12-31`;
  return <form data-saisie-confirmee action={submit} className="space-y-3 text-sm"><input name="empreinte" type="hidden" value={d.empreinte} />
    <label className="flex items-start gap-2"><input name="complet" type="checkbox" required className="mt-1" />J’ai vérifié que toutes les charges de cet exercice sont présentes, justifiées et ne sont pas déjà comptées ailleurs.</label>
    {enCours && <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3"><input name="exercice_en_cours" type="checkbox" required className="mt-1" />L’année n’est pas terminée. Je confirme ce décompte définitif, qui ne pourra pas être complété par une seconde régularisation annuelle.</label>}
    {tardive && Number(d.source.ecart) < 0 && <label className="flex items-start gap-2"><input name="etaler" type="checkbox" className="mt-1" />Le locataire demande à régler ce complément tardif en 12 mensualités.</label>}
    {etat.erreur && <p role="alert" className="text-destructive">{etat.erreur}</p>}
    <BoutonEnvoi enCours={pending} enCoursTexte="Création du décompte…">Valider la régularisation et créer le décompte</BoutonEnvoi>
    <p className="text-xs text-muted-foreground">Cette validation conserve le décompte dans les deux espaces. Elle ne déclenche aucun paiement.</p>
  </form>;
}
