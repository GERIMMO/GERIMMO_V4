"use client";

import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { enregistrerChambre, enregistrerPlafondColocation, type EtatChambre } from "@/app/actions/chambres";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";

type Chambre = { id: string; nom: string; surface_m2: number; volume_m3: number; description: string; espaces_partages: string; equipements: string | null };
type Cible = { orgId: string; lotId: string; bienId: string };

function FormulaireChambre({ cible, chambre }: { cible: Cible; chambre?: Chambre }) {
  const { etat, soumettre, enCours } = useActionFormulaire<EtatChambre>(enregistrerChambre.bind(null, cible.orgId, cible.lotId, cible.bienId));
  return <form onSubmit={soumettre} className="grid gap-3 sm:grid-cols-2">
    {chambre && <input type="hidden" name="id" value={chambre.id} />}
    <label className="space-y-1 text-sm">Nom de la chambre<Input name="nom" required maxLength={100} defaultValue={chambre?.nom} placeholder="Chambre côté jardin" /></label>
    <label className="space-y-1 text-sm">Surface privative (m²)<Input name="surface_m2" type="number" min="9" step="0.01" required defaultValue={chambre?.surface_m2} /></label>
    <label className="space-y-1 text-sm">Volume privatif (m³)<Input name="volume_m3" type="number" min="20" step="0.01" required defaultValue={chambre?.volume_m3} /></label>
    <label className="space-y-1 text-sm">Équipements privatifs<Input name="equipements" defaultValue={chambre?.equipements ?? ""} placeholder="Placard, bureau…" /></label>
    <label className="space-y-1 text-sm sm:col-span-2">Description et accès privatifs<textarea name="description" required defaultValue={chambre?.description} className="min-h-20 w-full rounded-md border p-2" placeholder="Situation dans le logement, porte, accès…" /></label>
    <label className="space-y-1 text-sm sm:col-span-2">Pièces et équipements partagés<textarea name="espaces_partages" required defaultValue={chambre?.espaces_partages} className="min-h-20 w-full rounded-md border p-2" placeholder="Cuisine équipée, séjour, salle de bains, WC…" /></label>
    {etat.erreur && <p role="alert" className="text-sm text-destructive sm:col-span-2">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="text-sm text-success-soft-foreground sm:col-span-2">{etat.succes}</p>}
    <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…" size="sm">{chambre ? "Enregistrer la chambre" : "Ajouter la chambre"}</BoutonEnvoi>
  </form>;
}

export function ChambresLogement({ orgId, lotId, bienId, chambres, plafond }: Cible & { chambres: Chambre[]; plafond: number | null }) {
  const { etat, soumettre, enCours } = useActionFormulaire<EtatChambre>(enregistrerPlafondColocation.bind(null, orgId, lotId, bienId));
  const cible = { orgId, lotId, bienId };
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Préparez une chambre par contrat. Le logement, ses propriétaires et ses diagnostics restent communs. Chaque locataire conserve son propre échéancier, son dépôt et son congé.</p>
    <form onSubmit={soumettre} className="space-y-2">
      <label className="space-y-1 text-sm">Loyer de référence du logement entier, hors charges (€ / mois)<Input name="plafond" type="number" min="0.01" step="0.01" required defaultValue={plafond ?? ""} /></label>
      <p className="text-xs text-muted-foreground">Retenez le montant applicable après vérification de l’encadrement local. La somme des loyers individuels ne pourra pas le dépasser.</p>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…" size="sm" variant="outline">Enregistrer le plafond</BoutonEnvoi>
    </form>
    {chambres.map(c => <details key={c.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{c.nom} · {c.surface_m2} m² · {c.volume_m3} m³</summary><div className="mt-3"><FormulaireChambre cible={cible} chambre={c} /></div></details>)}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Ajouter une chambre</summary><div className="mt-3"><FormulaireChambre cible={cible} /></div></details>
    <a href="#baux" className="text-sm underline">Créer le contrat individuel d’un locataire →</a>
  </div>;
}
