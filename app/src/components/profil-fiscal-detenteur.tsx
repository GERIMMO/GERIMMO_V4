"use client";
import { useActionState } from "react";
import Link from "next/link";
import { enregistrerProfilFiscal, type EtatProfilFiscal } from "@/app/actions/profil-fiscal";
import { dernierProfilFiscal, estSociete, orientationFiscale, type DetenteurFiscal, type ProfilFiscalDetenteur } from "@/lib/profil-fiscal";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { normaliserQualiteBailleur } from "@/lib/qualite-bailleur";

const champ = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
export function ProfilFiscalDetenteurForm({ orgId, personne, annee, profil, base, lectureSeule = false }: { orgId: string; personne: DetenteurFiscal; annee: number; profil: ProfilFiscalDetenteur | null; base: string; lectureSeule?: boolean }) {
  const [etat, action] = useActionState<EtatProfilFiscal, FormData>(enregistrerProfilFiscal.bind(null, orgId, personne.id, annee), {});
  const aRevoir = Boolean(profil && normaliserQualiteBailleur(personne.qualite) !== profil.qualite);
  const societe = estSociete(personne.qualite), orientation = orientationFiscale(aRevoir ? null : profil);
  const nom = [personne.prenom, personne.nom].filter(Boolean).join(" ");
  return <details className="rounded-xl border border-border bg-card p-4" open={!profil || aRevoir || undefined}>
    <summary className="cursor-pointer text-sm font-semibold"><span>{nom}</span><span className="ml-2 font-normal text-muted-foreground">{profil && !aRevoir ? orientation.libelle : "À confirmer"}</span></summary>
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">{personne.qualite || "Qualité à compléter"} · {annee} · <Link href={`${base}/personnes/${personne.id}`} className="underline">Fiche du propriétaire</Link></p>
      {orientation.formulaires.length > 0 && <p className="text-sm"><strong>À préparer :</strong> {orientation.formulaires.join(" · ")}</p>}
      {profil && orientation.aVerifier.map(message => <p key={message} className="text-sm text-muted-foreground">{message}</p>)}
      {lectureSeule ? <div className="space-y-2 text-sm"><p className="text-muted-foreground">Consultation uniquement. Les modifications sont réservées au propriétaire.</p>{profil ? <p><strong>Référence de vérification :</strong> {profil.justification}</p> : <p>Situation fiscale à confirmer par le propriétaire pour {annee}.</p>}</div> : !personne.qualite ? <p role="status" className="text-sm">Complétez d’abord la qualité dans la fiche du propriétaire.</p> : <form action={action} className="space-y-3" data-saisie-libre>
        {societe ? <label className="block space-y-1 text-sm"><span>Imposition de la société</span><select name="imposition" className={champ} defaultValue={profil?.imposition ?? "a_confirmer"}><option value="a_confirmer">À confirmer avec le comptable</option><option value="ir">Impôt sur le revenu (IR)</option><option value="is">Impôt sur les sociétés (IS)</option></select></label> : <>
          <input type="hidden" name="imposition" value="ir" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Locations nues</span><select name="location_nue" className={champ} defaultValue={profil?.location_nue ?? "a_confirmer"}><option value="a_confirmer">À confirmer</option><option value="micro">Micro-foncier</option><option value="reel">Régime réel</option><option value="non_concerne">Non concerné cette année</option></select></label>
            <label className="space-y-1 text-sm"><span>Locations meublées</span><select name="location_meublee" className={champ} defaultValue={profil?.location_meublee ?? "a_confirmer"}><option value="a_confirmer">À confirmer</option>{personne.qualite !== "Indivision (personnes physiques)" && <option value="micro">Micro-BIC</option>}<option value="reel">Régime réel BIC</option><option value="non_concerne">Non concerné cette année</option></select></label>
          </div>
          <p className="text-xs text-muted-foreground">Le choix fiscal concerne aussi les biens gérés hors Gerimmo. Il ne se choisit pas appartement par appartement.</p>
        </>}
        <label className="block space-y-1 text-sm"><span>Référence de vérification</span><input name="justification" required minLength={3} maxLength={1000} className={champ} defaultValue={profil?.justification ?? ""} placeholder="Ex. déclaration précédente ou confirmation du comptable" /></label>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="confirme" value="oui" required className="mt-1" /><span>Je confirme cette situation pour {annee}.</span></label>
        {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
        {etat.succes && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{etat.succes}</p>}
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </form>}
    </div>
  </details>;
}

export function ProfilsFiscaux({ orgId, annee, detenteurs, profils, base, erreur, lectureSeule = false }: { orgId: string; annee: number; detenteurs: DetenteurFiscal[]; profils: ProfilFiscalDetenteur[]; base: string; erreur?: string | null; lectureSeule?: boolean }) {
  return <section className="space-y-3" aria-labelledby="situation-fiscale">
    <div><h2 id="situation-fiscale" className="text-lg">La bonne déclaration pour chaque propriétaire</h2><p className="text-sm text-muted-foreground">Une situation par propriétaire et par année, reprise pour tous ses biens dans cet espace.</p></div>
    {erreur ? <p role="alert" className="err">{erreur}</p> : detenteurs.map(p => { const profil = dernierProfilFiscal(profils, p.id, annee); return <ProfilFiscalDetenteurForm key={`${p.id}-${profil?.version ?? 0}`} orgId={orgId} annee={annee} personne={p} profil={profil} base={base} lectureSeule={lectureSeule} />; })}
    {!erreur && !detenteurs.length && <p className="text-sm">{lectureSeule ? "Aucun propriétaire n’est rattaché à ces biens pour cet exercice." : "Ajoutez la détention dans la fiche du bien pour retrouver ici son propriétaire."}</p>}
    <p className="text-xs text-muted-foreground">Gerimmo prépare les informations et les pièces ; il ne télédéclare pas. <a className="underline" href="https://www.impots.gouv.fr/professionnel/questions/comment-declarer-les-resultats-de-ma-sci" target="_blank" rel="noreferrer">Déclarations SCI</a> · <a className="underline" href="https://www.impots.gouv.fr/particulier/location-meublee" target="_blank" rel="noreferrer">Locations meublées</a></p>
  </section>;
}
