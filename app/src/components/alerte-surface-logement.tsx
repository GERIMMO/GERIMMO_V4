import { TriangleAlert } from "lucide-react";
import { alertesDecence } from "@/lib/parc";
import { lireDecimal } from "@/lib/saisie-montant";

/** Une surface saisie n’est pas une validation de la décence du logement. */
export function AlerteSurfaceLogement({ surface, typeBien, id }: {
  surface: string | number | null;
  typeBien?: string;
  id?: string;
}) {
  // Lue comme le serveur la lira (« 8,5 » vaut 8,5) ; illisible, elle n'alerte pas.
  const lue = surface === null ? null : lireDecimal(String(surface));
  const valeur = lue && "valeur" in lue ? lue.valeur : null;
  const habitation = ["appartement", "maison", "immeuble"].includes(typeBien ?? "");
  const message = habitation ? alertesDecence({ surface_m2: valeur })[0] : undefined;
  return <div id={id} aria-live="polite" aria-atomic="true">
    {message && <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
      <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div><strong className="block">Surface inférieure à 9 m² : à vérifier avant de louer</strong>
        <p className="mt-1">{message} Vous pouvez enregistrer le lot ; cela ne valide pas sa mise en location.</p>
        <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F2042" target="_blank" rel="noreferrer" className="mt-2 inline-block underline underline-offset-2">Consulter les critères de décence (Service Public)</a>
      </div>
    </div>}
  </div>;
}
