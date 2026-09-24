"use client";

import { useActionState, useId } from "react";
import { enregistrerMentionsEdl, type EtatEdl } from "@/app/actions/edl";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mentions = { personnes_presentes: string | null; detecteur_fumee_present: boolean | null; detecteur_fumee_etat: string | null; attestation_assurance_fournie: boolean | null; adresse_restitution_depot: string | null; observations: string | null };

export function EdlMentions({ orgId, bailId, edlId, type, signe, mentions }: { orgId:string; bailId:string; edlId:string; type:"entree"|"sortie"; signe:boolean; mentions:Mentions }) {
  const [etat, action] = useActionState<EtatEdl, FormData>(enregistrerMentionsEdl.bind(null, orgId, bailId, edlId, type), {});
  const v=(nom:keyof Mentions)=>etat.valeurs?.[nom] ?? (mentions[nom] == null ? "" : String(mentions[nom]));
  // Les deux sélecteurs sont bâtis comme les champs texte voisins (24/09) :
  // même <Label>, même hauteur (h-8) et mêmes angles (rounded-lg) — ils
  // étaient plus hauts de 4 px, plus carrés, et leur libellé décalé de 3 px.
  const base = useId();
  const classeChoix = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="edl-presents">Personnes présentes *</Label><Input id="edl-presents" name="personnes_presentes" required disabled={signe} defaultValue={v("personnes_presentes")} placeholder="Bailleur, locataire, mandataire…" /></div>
    {type === "entree" ? <>
      <div className="space-y-2"><Label htmlFor={`${base}-detecteur`}>Détecteur de fumée *</Label><select id={`${base}-detecteur`} name="detecteur_fumee_present" required disabled={signe} defaultValue={mentions.detecteur_fumee_present == null ? "" : mentions.detecteur_fumee_present ? "oui" : "non"} className={classeChoix}><option value="">Choisir</option><option value="oui">Présent</option><option value="non">Absent</option></select></div>
      {/* Un exemple se dit exemple : « Testé et fonctionnel » dans un champ
          obligatoire passait pour une valeur déjà saisie (24/09). */}
      <div className="space-y-2"><Label htmlFor="edl-detecteur-etat">État du détecteur *</Label><Input id="edl-detecteur-etat" name="detecteur_fumee_etat" required disabled={signe} defaultValue={v("detecteur_fumee_etat")} placeholder="ex. : testé et fonctionnel" /></div>
      <div className="space-y-2"><Label htmlFor={`${base}-assurance`}>Attestation d’assurance fournie *</Label><select id={`${base}-assurance`} name="attestation_assurance_fournie" required disabled={signe} defaultValue={mentions.attestation_assurance_fournie == null ? "" : mentions.attestation_assurance_fournie ? "oui" : "non"} className={classeChoix}><option value="">Choisir</option><option value="oui">Oui</option><option value="non">Non</option></select></div>
    </> : <div className="space-y-2 sm:col-span-2"><Label htmlFor="edl-adresse-restitution">Adresse de restitution du dépôt *</Label><Input id="edl-adresse-restitution" name="adresse_restitution_depot" required disabled={signe} defaultValue={v("adresse_restitution_depot")} /></div>}
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="edl-observations">Observations des parties *</Label><textarea id="edl-observations" name="observations" required disabled={signe} rows={3} defaultValue={v("observations")} placeholder="Néant, ou observations contradictoires" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" /></div>
    {etat.erreur&&<p role="alert" className="text-sm text-destructive sm:col-span-2">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm text-success-soft-foreground sm:col-span-2">{etat.succes}</p>}
    {/* Contour et largeur du texte, comme « Enregistrer la grille » : étiré
        par la grille en bleu plein, il se lisait comme l'action principale de
        la page, qui est « Enregistrer et signer » (24/09). */}
    {!signe&&<BoutonEnvoi size="sm" variant="outline" className="justify-self-start sm:col-span-2">Enregistrer les mentions</BoutonEnvoi>}
  </form>;
}
