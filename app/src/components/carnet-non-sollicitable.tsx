import { motifsCarnetPourBien, type ArtisanCarnetBien } from "@/lib/invitations-artisan";

/**
 * Dans la fiche d'un incident du propriétaire : les artisans de son carnet, du métier demandé, qui ne peuvent PAS être
 * sollicités pour ce bien, et pourquoi (seconde relecture du 15/10/2026 du lot « invitation-artisan »). Sans cet encart,
 * un artisan validé mais dont la zone ne couvre pas le bien, ou sans décennale valide quand les travaux l'exigent,
 * disparaissait sans explication. Rien ne s'affiche si tous peuvent l'être, ou si aucun n'exerce ce métier.
 * Sans état ni effet : utilisable dans un composant serveur comme dans un formulaire client.
 */
export function CarnetNonSollicitable({
  artisans,
  metier,
  decennaleExigee,
}: {
  artisans: ArtisanCarnetBien[];
  metier: string;
  decennaleExigee: boolean;
}) {
  const refuses = artisans
    .map((a) => ({ a, motifs: motifsCarnetPourBien(a, metier, decennaleExigee) }))
    .filter((x): x is { a: ArtisanCarnetBien; motifs: string[] } => x.motifs !== null && x.motifs.length > 0);
  if (refuses.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-3 text-sm">
      <p className="font-medium">Dans votre carnet, ne peuvent pas être sollicités pour ce bien :</p>
      <ul className="list-disc space-y-1 pl-5">
        {refuses.map(({ a, motifs }) => (
          <li key={a.artisan_id} className="break-words">
            <strong>{a.raison_sociale}</strong> : {motifs.join(" ; ")}.
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        La zone d’intervention et les attestations appartiennent à l’artisan : il les met à jour depuis son espace.
      </p>
    </div>
  );
}
