"use client";
import { useState, useTransition } from "react";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { notifierDecompte, reglerAvisDecompte, preparerRegularisationFournitures, emettreRegularisationFournitures, type EtatRegularisationFournitures } from "@/app/actions/regularisation-fournitures";
import type { BrouillonRegularisationFourniture } from "@/lib/regularisation-fournitures";
import { eur, formaterDate } from "@/lib/ged";
import { BoutonEnvoi } from "./ui/bouton-envoi";
import { ProposerPlanCharges } from "./echeanciers-charges-client";
import { ApercuDocumentEspace } from "./apercu-document-espace";

import { Button } from "./ui/button";
import { FilePlus2, Eye, Send, FileCheck2 } from "lucide-react";
import { Modale } from "./ui/modale";
import { LecteurDocument } from "./lecteur-document";
import type { EtatLigneDecompte } from "@/lib/regularisation-fournitures";

type EtatEmission = EtatRegularisationFournitures & { brouillonId?: string; empreinte?: string };

export function RegularisationFournitures({ orgId, bailId, annee, aujourdhui, base, onAnneeChange, affichageDirect = false, identifiant = "regularisation-fournitures" }: { orgId: string; bailId: string; annee: number; aujourdhui: string; base: string; onAnneeChange: (annee: string) => void; affichageDirect?: boolean; identifiant?: string }) {
  const [etat, submit, pending] = useActionStateProtegee(preparerRegularisationFournitures.bind(null, orgId, bailId), {} as EtatRegularisationFournitures);
  const d = etat.brouillon?.annee === annee ? etat.brouillon : undefined;
  const [emission, emettre, emissionPending] = useActionStateProtegee(async (_: EtatEmission, form: FormData): Promise<EtatEmission> => {
    if (!d) return { erreur: "Préparez le décompte de cet exercice avant de le valider." };
    const resultat = await emettreRegularisationFournitures(orgId, bailId, d.id, {}, form);
    return { ...resultat, brouillonId: d.id, empreinte: d.empreinte };
  }, {} as EtatEmission);
  const resultatEmission = d && emission.brouillonId === d.id && emission.empreinte === d.empreinte ? emission : d?.regularisation_id ? etat : {};
  const valide = Boolean(resultatEmission.succes);
  const Conteneur = affichageDirect ? "section" : "details";
  return <Conteneur id={identifiant} className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-muted/25 p-3">
    {affichageDirect ? <h4 className="text-sm font-semibold">Décompte locataire et paiement</h4> : <summary className="cursor-pointer text-sm font-medium">Utiliser les factures déjà réparties</summary>}
    <form data-saisie-confirmee action={submit} className="flex flex-wrap items-end gap-3"><label className="text-sm">Année<input name="annee" type="number" min="1970" max={Number(aujourdhui.slice(0,4))} required disabled={pending || emissionPending} value={Number.isInteger(annee) ? annee : ""} onChange={e => onAnneeChange(e.target.value)} className="ml-2 w-24 rounded-md border border-input bg-background p-2" /></label>{!valide && <BoutonEnvoi variant="outline" enCours={pending} disabled={emissionPending} enCoursTexte="Calcul…">{d ? "Recalculer avec les dernières factures" : "Préparer depuis les factures"}</BoutonEnvoi>}</form>
    <p className="text-xs text-muted-foreground">Exercice {annee} · les parts validées et les provisions du bail sont reprises automatiquement.</p>
    {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {d && <div className="space-y-3"><p className="text-sm font-semibold">{valide ? "Régularisation validée" : "Brouillon à vérifier"} · {d.annee}</p>
      <ul className="space-y-2 text-sm">{d.source.factures.map(x => <li key={x.repartition_id} className="flex flex-wrap items-center justify-between gap-2"><span>{x.fournisseur} · {x.reference}<span className="block text-xs text-muted-foreground">{formaterDate(x.debut)} – {formaterDate(x.fin)}</span></span><strong>{eur(Number(x.montant_cents) / 100)}</strong></li>)}</ul>
      <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm"><dt>Charges réelles</dt><dd className="text-right">{eur(Number(d.source.charges_reelles))}</dd><dt>Provisions appelées</dt><dd className="text-right">{eur(Number(d.source.provisions))}</dd><dt className="font-medium">{Number(d.source.ecart) >= 0 ? "En faveur du locataire" : "Complément"}</dt><dd className="text-right font-semibold">{eur(Math.abs(Number(d.source.ecart)))}</dd></dl>
      <p className="text-xs text-muted-foreground">Les parts tiennent déjà compte de l’occupation et de la colocation. Les impayés de provisions restent suivis séparément dans les loyers.</p>
      <ReglageAvis key={bailId} org={orgId} bail={bailId} actif={etat.automatique ?? false} /><Emission orgId={orgId} key={`${d.id}:${d.empreinte}`} d={d} aujourdhui={aujourdhui} base={base} etat={resultatEmission} submit={emettre} pending={emissionPending} />
    </div>}
  </Conteneur>;
}
function Emission({ envoiDirect = false, orgId, d, aujourdhui, base, etat, submit, pending }: { envoiDirect?: boolean; orgId: string; d: BrouillonRegularisationFourniture; aujourdhui: string; base: string; etat: EtatRegularisationFournitures; submit: (form: FormData) => void; pending: boolean }) {
  const [etaler, setEtaler] = useState(false);
  const [avis, envoyer, envoi] = useActionStateProtegee(async () => notifierDecompte(orgId,d.id), {} as EtatRegularisationFournitures);
  const dateAvis = avis.avisLe ?? etat.avisLe;
  if (etat.succes) return <div className="space-y-2"><p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>{dateAvis ? <p>Avis envoyé dans Gerimmo le {formaterDate(dateAvis.slice(0,10))}{etat.consulteLe && ` · Accès au PDF le ${formaterDate(etat.consulteLe.slice(0,10))}`}</p> : <form action={envoyer}><BoutonEnvoi enCours={envoi} enCoursTexte="Transmission…">Notifier le locataire dans Gerimmo</BoutonEnvoi>{avis.erreur && <p role="alert">{avis.erreur}</p>}</form>}{etat.documentId && <ApercuDocumentEspace fichier={`${base}/documents/${etat.documentId}/fichier`} titre={`Décompte de charges ${d.annee}`} />}{etat.regularisationId && Number(d.source.ecart)<0 && <ProposerPlanCharges org={orgId} regularisation={etat.regularisationId} annee={d.annee} montant={-Number(d.source.ecart)} aujourdhui={aujourdhui} tardive={aujourdhui > `${d.annee+1}-12-31`} />}</div>;
  const enCours = `${d.annee}-12-31` >= aujourdhui;
  const tardive = aujourdhui > `${d.annee + 1}-12-31`;
  return <form data-saisie-confirmee action={submit} className="space-y-3 text-sm"><input name="empreinte" type="hidden" value={d.empreinte} />
    <label className="flex items-start gap-2"><input name="complet" type="checkbox" required className="mt-1" />J’ai vérifié que toutes les charges de cet exercice sont présentes, justifiées et ne sont pas déjà comptées ailleurs.</label>
    {enCours && <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3"><input name="exercice_en_cours" type="checkbox" required className="mt-1" />L’année n’est pas terminée. Je confirme ce décompte définitif, qui ne pourra pas être complété par une seconde régularisation annuelle.</label>}
    {tardive && Number(d.source.ecart) < 0 && <label className="flex items-start gap-2"><input name="etaler" type="checkbox" checked={etaler} onChange={e=>setEtaler(e.target.checked)} className="mt-1" />Le locataire demande à régler ce complément tardif en 12 mensualités.</label>}
    {etat.erreur && <p role="alert" className="text-destructive">{etat.erreur}</p>}
    {!d.source.bailleur && <p role="alert">Renseignez le détenteur dans la fiche du logement, puis recalculez le décompte.</p>}
    {d.source.bailleur && <ApercuDocumentEspace fichier={`/api/decompte-charges/${orgId}/${d.id}?version=${d.empreinte}&etaler=${etaler ? "1" : "0"}`} titre={`Vérifier le PDF de ${d.source.locataire}`} mime="application/pdf" />}
    <BoutonEnvoi disabled={!d.source.bailleur} enCours={pending} enCoursTexte="Création du décompte…">{envoiDirect ? "Confirmer et envoyer" : "Valider la régularisation et créer le décompte"}</BoutonEnvoi>
    <p className="text-xs text-muted-foreground">Cette validation conserve le décompte dans les deux espaces. Elle ne déclenche aucun paiement.</p>
  </form>;
}

function ReglageAvis({org,bail,actif}:{org:string;bail:string;actif:boolean}) {
  const [etat, changer, pending] = useActionStateProtegee(async (_:EtatRegularisationFournitures,f:FormData) =>
    reglerAvisDecompte(org,bail,f.get("actif")==="oui"), {} as EtatRegularisationFournitures);
  const auto = etat.automatique ?? actif;
  return <details><summary>Avis au locataire · {auto ? "automatique après validation" : "manuel"}</summary>
    <form action={changer}><input type="hidden" name="actif" value={auto ? "non" : "oui"}/>
      <BoutonEnvoi variant="outline" enCours={pending} enCoursTexte="Enregistrement…">{auto ? "Revenir à l’envoi manuel" : "Notifier automatiquement après validation du décompte de ce bail"}</BoutonEnvoi>
      {etat.erreur && <p role="alert">{etat.erreur}</p>}</form></details>;
}

export function ActionsDecompteLigne({org, bail, annee, jour, base, initial}: {
  org: string; bail: string; annee: number; jour: string; base: string; initial?: EtatLigneDecompte;
}) {
  const [etat, setEtat] = useState<EtatRegularisationFournitures>({});
  const [fenetre, ouvrir] = useState<"visualiser" | "envoyer" | null>(null);
  const [erreur, signaler] = useState("");
  const [pending, lancer] = useTransition();
  const d = etat.brouillon;
  const prepare = Boolean(initial || d);
  const envoye = etat.avisLe ?? initial?.avis_le;

  function charger(action: typeof fenetre, recalcul = false) {
    signaler("");
    lancer(async () => {
      try {
        const f = new FormData();
        f.set("annee", String(annee));
        if (!recalcul) f.set("ligne", "oui");
        const resultat = await preparerRegularisationFournitures(org, bail, {}, f);
        if (!resultat.brouillon) { signaler(resultat.erreur ?? "Décompte indisponible."); return; }
        setEtat(resultat);
        ouvrir(action);
      } catch { signaler("Lecture impossible. Réessayez."); }
    });
  }

  function envoyer(f: FormData) {
    if (!d) return;
    signaler("");
    lancer(async () => {
      try {
        const emission = etat.regularisationId ? etat : await emettreRegularisationFournitures(org, bail, d.id, {}, f);
        if (!emission.regularisationId) { signaler(emission.erreur ?? "La validation a échoué."); return; }
        setEtat({ ...etat, ...emission });
        const avis = emission.avisLe ? emission : await notifierDecompte(org, d.id);
        if (!avis.avisLe) { signaler(avis.erreur ?? "Envoi à réessayer."); return; }
        setEtat({ ...etat, ...emission, avisLe: avis.avisLe });
        ouvrir(null);
      } catch { signaler("Transmission interrompue. Vérifiez le statut avant de réessayer."); }
    });
  }

  return <div className="flex flex-wrap items-center gap-1">
    {prepare ? <span title="Préparé" className="inline-flex items-center p-2 text-emerald-700"><FileCheck2 size={17} aria-hidden="true"/><span className="sr-only">Préparé</span></span> :
      <Button title="Préparer" aria-label="Préparer" className="!p-2" size="sm" variant="outline" disabled={pending} onClick={()=>charger(null)}><FilePlus2 size={17} aria-hidden="true"/></Button>}
    <Button title="Visualiser" aria-label="Visualiser" className="!p-2" size="sm" variant="outline" disabled={!prepare || pending} onClick={()=>charger("visualiser")}><Eye size={17} aria-hidden="true"/></Button>
    {envoye ? <span className="text-xs text-success-soft-foreground">Envoyé le {formaterDate(envoye.slice(0,10))}</span> :
      <Button title="Envoyer" aria-label="Envoyer" className="!p-2" size="sm" disabled={!prepare || pending} onClick={()=>charger("envoyer")}><Send size={17} aria-hidden="true"/></Button>}
    {erreur && !fenetre && <p role="alert">{erreur}</p>}
    {fenetre && d && <Modale titre={`Décompte ${annee} · ${d.source.locataire}`} tresLarge={fenetre==="visualiser"} fermer={()=>{if(!pending) ouvrir(null);}}>
      {fenetre==="visualiser" ? <LecteurDocument titre={`Décompte ${annee}`} mime="application/pdf" presentation="fiche" fichier={etat.documentId ? `${base}/documents/${etat.documentId}/fichier` : `/api/decompte-charges/${org}/${d.id}?version=${d.empreinte}`}/> :
        <div className="space-y-3 text-sm"><p>{d.source.logement} · Charges {eur(d.source.charges_reelles)} · Provisions {eur(d.source.provisions)}</p>
          <p>{d.source.ecart >= 0 ? "En faveur du locataire" : "Complément de charges"} · {eur(Math.abs(d.source.ecart))}</p>
          {etat.regularisationId ? <Button disabled={pending || !!envoye} onClick={()=>envoyer(new FormData())}>Confirmer l’envoi au locataire</Button> :
            <Emission envoiDirect orgId={org} d={d} aujourdhui={jour} base={base} etat={{}} submit={envoyer} pending={pending}/>}
          {erreur && <p role="alert">{erreur}</p>}
          {!etat.regularisationId && (erreur || !d.source.bailleur) && <Button variant="outline" disabled={pending} onClick={()=>charger("envoyer", true)}>Actualiser le calcul</Button>}
        </div>}
    </Modale>}
  </div>;
}
