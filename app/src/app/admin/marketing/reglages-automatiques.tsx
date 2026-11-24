"use client";

import { PHASES, type Phase } from "@/lib/phases-marketing";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { DiffusionFacebookMasquee } from "@/components/diffusion-facebook-masquee";
import type { EtatPageFacebook } from "@/lib/diffusion-facebook";
import { enregistrerReglagesMarketing, type EtatCampagne } from "./actions";

type Reglages = { phase_editoriale?: Phase; actif: boolean; publication_automatique: boolean; publicite_active: boolean; jours_semaine: number[]; heure_paris: number; budget_mensuel_cents: number; validation_obligatoire: boolean; veille_mots_inclus: string[]; veille_mots_exclus: string[] };
const JOURS = [[1,"Lundi"],[2,"Mardi"],[3,"Mercredi"],[4,"Jeudi"],[5,"Vendredi"],[6,"Samedi"],[7,"Dimanche"]] as const;

// Une seule façon d'habiller un champ sur la rangée (24/09) : sélecteurs nus,
// faux champ « Créneau » encadré et plafond nu cohabitaient. Même classe que
// le formulaire de campagne et les autres formulaires de la console.
const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
// Le même cadre, avec l'unité « € » en suffixe à l'intérieur.
const champAvecUnite = "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--marque)]";
const caseACocher = "flex items-start gap-2 rounded-[var(--rayon-bouton)] border border-[var(--filet)] bg-[var(--carte)] p-3";

// `pageFacebook` (audit 25/09, C21, puis décision du 25/11/2026) : sans Page Facebook reliée ET lue (« Relié »),
// « Publier automatiquement » n'est plus seulement grisé, il est MASQUÉ, et un court texte dit pourquoi et où
// vérifier la Page. Comme la case grisée d'avant, la case masquée n'est pas envoyée : enregistrer les réglages dans
// cet état laisse la publication automatique désactivée ; elle se recoche une fois la Page reliée et lue.
export function ReglagesAutomatiques({ reglages, comptePublicitaire, pageFacebook = "relie" }: { reglages: Reglages; comptePublicitaire: boolean; pageFacebook?: EtatPageFacebook }) {
  const [etat, action, attente] = useActionState(enregistrerReglagesMarketing, {} as EtatCampagne);
  return <form data-saisie-confirmee action={action} className="space-y-4">
    <label className="grid gap-1"><span className="libelle-champ">Phase éditoriale</span><select name="phase_editoriale" defaultValue={reglages.phase_editoriale} className={champ}>{Object.entries(PHASES).map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={caseACocher}><input type="checkbox" name="actif" defaultChecked={reglages.actif} className="mt-1" /><span><b>Agent actif</b><small className="mt-1 block text-[var(--texte-secondaire)]">Prépare deux sujets par semaine et crée un visuel original pour chacun.</small></span></label>
      {pageFacebook === "relie"
        ? <label className={caseACocher}><input type="checkbox" name="publication_automatique" defaultChecked={reglages.publication_automatique} className="mt-1"/><span><b>Publier automatiquement</b><small className="mt-1 block text-[var(--texte-secondaire)]">Journal et Facebook. Décochez pour conserver les prochains contenus en brouillon.</small></span></label>
        : <div className={caseACocher}><div><b>Publication automatique</b><DiffusionFacebookMasquee etat={pageFacebook} className="mt-1 text-[12px] leading-snug text-[var(--texte-secondaire)]" /></div></div>}
      {/* La publicité n'est pas un geste de cet écran (25/09) : l'état dit ce
          qui est vrai en base et pourquoi rien ne part. */}
      <div className={caseACocher}><span><b>Publicité payante : non ouverte</b><small className="mt-1 block text-[var(--texte-secondaire)]">{comptePublicitaire ? "Compte Meta Ads relié en lecture seule : Gerimmo suit les résultats et les dépenses, sans lancer de campagne." : "Compte Meta Ads à relier. Aucune campagne payante ne part de Gerimmo."}{reglages.publicite_active ? " Le réglage enregistré (publicité autorisée) est conservé pour le jour où elle ouvrira." : ""}</small></span></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1"><span className="libelle-champ">Premier jour</span><select className={champ} name="jour_1" defaultValue={reglages.jours_semaine[0] ?? 2}>{JOURS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="grid gap-1"><span className="libelle-champ">Deuxième jour</span><select className={champ} name="jour_2" defaultValue={reglages.jours_semaine[1] ?? 5}>{JOURS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {/* Le créneau n'est pas réglable : il s'affiche comme un champ, en
          lecture seule, au lieu d'une boîte d'un autre style. */}
      {/* 06/10 : l'heure est réglable et respectée (heure de Paris, été
          comme hiver) ; le post est préparé la veille à 18 h. */}
      <label className="grid gap-1"><span className="libelle-champ">Heure de parution (Paris)</span><select className={champ} name="heure_paris" defaultValue={reglages.heure_paris}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}</select></label>
      <label className="grid gap-1"><span className="libelle-champ">Seuil d’alerte mensuel</span><span className={champAvecUnite}><input name="budget" type="text" inputMode="decimal" defaultValue={(reglages.budget_mensuel_cents/100).toFixed(2)} className="min-w-0 flex-1 bg-transparent py-2 outline-none" /><span aria-hidden className="text-[var(--texte-secondaire)]">€</span></span></label>
    </div>
    <label className={caseACocher}><input type="checkbox" name="validation_obligatoire" defaultChecked={reglages.validation_obligatoire} className="mt-1" /><span><b>Validation obligatoire</b><small className="mt-1 block text-[var(--texte-secondaire)]">Décoché : le post préparé la veille part à l’heure dite sauf si vous le reportez ou le refusez. Coché : rien ne part sans « Valider » ou « Publier maintenant ».</small></span></label>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1"><span className="libelle-champ">Veille : mots qui rendent un sujet éligible</span><textarea name="veille_mots_inclus" rows={4} defaultValue={reglages.veille_mots_inclus.join(", ")} className={champ} /><small className="text-xs text-[var(--texte-secondaire)]">Séparés par des virgules. Lus dans le titre et le résumé de l’étude ; pluriels admis.</small></label>
      <label className="grid gap-1"><span className="libelle-champ">Veille : mots qui écartent un sujet</span><textarea name="veille_mots_exclus" rows={4} defaultValue={reglages.veille_mots_exclus.join(", ")} className={champ} /><small className="text-xs text-[var(--texte-secondaire)]">Un seul mot exclu suffit. Sans sujet éligible, le créneau prend un sujet éditorial.</small></label>
    </div>
    <p className="text-xs text-[var(--texte-secondaire)]">Le seuil d’alerte compare les dépenses Meta constatées : au-delà, la tuile « Dépenses ce mois » passe au rouge. Il n’engage aucune dépense. Chaque illustration est créée pour son sujet ; la création d’images utilise votre connexion IA et sa facturation.</p><div className="flex flex-wrap items-center gap-3"><button className="btn-or" disabled={attente}>{attente ? "Enregistrement…" : "Enregistrer les réglages"}</button>{etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-[var(--success)]">{etat.succes}</p>}</div>
  </form>;
}
