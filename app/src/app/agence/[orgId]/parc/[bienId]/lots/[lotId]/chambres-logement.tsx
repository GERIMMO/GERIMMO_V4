"use client";

import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { enregistrerChambre, enregistrerPlafondColocation, type EtatChambre } from "@/app/actions/chambres";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { PastilleBail } from "@/components/pastille-bail";
import { Input } from "@/components/ui/input";

type Chambre = { id: string; nom: string; surface_m2: number; volume_m3: number; description: string; espaces_partages: string; equipements: string | null };
type Cible = { orgId: string; lotId: string; bienId: string };

function FormulaireChambre({ cible, chambre }: { cible: Cible; chambre?: Chambre }) {
  const { etat, soumettre, enCours } = useActionFormulaire<EtatChambre>(enregistrerChambre.bind(null, cible.orgId, cible.lotId, cible.bienId));
  return <form onSubmit={soumettre} className="grid gap-3 sm:grid-cols-2">
    {chambre && <input type="hidden" name="id" value={chambre.id} />}
    <label className="space-y-1 text-sm">Nom de la chambre<PastilleBail champ="chambre.nom" renseigne={Boolean(chambre?.nom)}/><Input name="nom" required maxLength={100} defaultValue={chambre?.nom} placeholder="Chambre côté jardin" /></label>
    <label className="space-y-1 text-sm">Surface privative (m²)<PastilleBail champ="chambre.surface_m2" renseigne={Boolean(chambre?.surface_m2)}/><Input name="surface_m2" type="number" min="9" step="0.01" required defaultValue={chambre?.surface_m2} /></label>
    <label className="space-y-1 text-sm">Volume privatif (m³)<PastilleBail champ="chambre.volume_m3" renseigne={Boolean(chambre?.volume_m3)}/><Input name="volume_m3" type="number" min="20" step="0.01" required defaultValue={chambre?.volume_m3} /></label>
    <label className="space-y-1 text-sm">Équipements privatifs<PastilleBail champ="chambre.equipements" renseigne={Boolean(chambre?.equipements)}/><Input name="equipements" defaultValue={chambre?.equipements ?? ""} placeholder="Placard, bureau…" /></label>
    <label className="space-y-1 text-sm sm:col-span-2">Description et accès privatifs<PastilleBail champ="chambre.description" renseigne={Boolean(chambre?.description)}/><textarea name="description" required defaultValue={chambre?.description} className="min-h-20 w-full rounded-md border p-2" placeholder="Situation dans le logement, porte, accès…" /></label>
    <label className="space-y-1 text-sm sm:col-span-2">Pièces et équipements partagés<PastilleBail champ="chambre.espaces_partages" renseigne={Boolean(chambre?.espaces_partages)}/><textarea name="espaces_partages" required defaultValue={chambre?.espaces_partages} className="min-h-20 w-full rounded-md border p-2" placeholder="Cuisine équipée, séjour, salle de bains, WC…" /></label>
    {etat.erreur && <p role="alert" className="text-sm text-destructive sm:col-span-2">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="text-sm text-success-soft-foreground sm:col-span-2">{etat.succes}</p>}
    <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…" size="sm">{chambre ? "Enregistrer la chambre" : "Ajouter la chambre"}</BoutonEnvoi>
  </form>;
}

export function ChambresLogement({ orgId, lotId, bienId, chambres, plafond, mode = "tout" }: Cible & { chambres: Chambre[]; plafond: number | null; mode?: "tout" | "chambres" | "plafond" }) {
  const { etat, soumettre, enCours } = useActionFormulaire<EtatChambre>(enregistrerPlafondColocation.bind(null, orgId, lotId, bienId));
  const cible = { orgId, lotId, bienId };
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Préparez une chambre par contrat. Le logement, ses propriétaires et ses diagnostics restent communs. Chaque locataire conserve son propre échéancier, son dépôt et son congé.</p>
    {mode !== "chambres" && <form onSubmit={soumettre} className="space-y-2">
      <label className="space-y-1 text-sm">Loyer de référence du logement entier, hors charges (€ / mois)<PastilleBail champ="chambre.plafond" renseigne={plafond != null}/><Input name="plafond" type="number" min="0.01" step="0.01" required defaultValue={plafond ?? ""} /></label>
      <p className="text-xs text-muted-foreground">Retenez le montant applicable après vérification de l’encadrement local. La somme des loyers individuels ne pourra pas le dépasser.</p>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…" size="sm" variant="outline">Enregistrer le plafond</BoutonEnvoi>
    </form>}
    {mode !== "plafond" && <>{chambres.map(c => <details key={c.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{c.nom} · {c.surface_m2} m² · {c.volume_m3} m³</summary><div className="mt-3"><FormulaireChambre cible={cible} chambre={c} /></div></details>)}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Ajouter une chambre</summary><div className="mt-3"><FormulaireChambre cible={cible} /></div></details>
    </>}
    {mode === "tout" && <a href="#baux" className="text-sm underline">Créer le contrat individuel d’un locataire →</a>}
  </div>;
}
