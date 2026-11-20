import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { RendezVousLocataire } from "@/lib/rendez-vous-locataire";

/** Seule la lecture autorisée du rendez-vous enregistré confirme la date. */
export function RendezVousLocataireConfirme({ lignes, orgId, selection }: {
  lignes: RendezVousLocataire[]; orgId: string; selection?: string;
}) {
  const maintenant = new Date().getTime();
  const rv = lignes.filter(r => r.statut_mission === "planifiee" && r.rdv_debut && r.rdv_fin &&
    Date.parse(r.rdv_fin) > maintenant && (!selection || r.intervention_id === selection))
    .sort((a, b) => Date.parse(a.rdv_debut!) - Date.parse(b.rdv_debut!))[0];
  if (!rv?.rdv_debut || !rv.rdv_fin) return null;
  const options = {timeZone: "Europe/Paris"} as const;
  const jour = new Intl.DateTimeFormat("fr-FR", {...options, dateStyle:"full"}).format(new Date(rv.rdv_debut));
  const heure = new Intl.DateTimeFormat("fr-FR", {...options, timeStyle:"short"});
  // Titre de carte au dessin commun (`titre-carte`, 20/11) : sans la classe, ce h2 prenait la police et la taille des
  // titres de section. L'icône porte le vert des états acquis, le texte reste à 14 px comme dans les cartes voisines.
  return <section className="loc-carte flex items-start gap-3" aria-label="Rendez-vous confirmé">
    <CalendarCheck aria-hidden size={22} className="mt-0.5 shrink-0 text-[var(--success)]"/>
    <div className="min-w-0 text-sm"><h2 className="titre-carte text-base font-semibold">Rendez-vous confirmé</h2>
      <p role="status" className="mt-1">{jour}, de {heure.format(new Date(rv.rdv_debut))} à {heure.format(new Date(rv.rdv_fin))}.</p>
      {rv.demande_statut === "en_attente" && <p>Votre demande de modification attend une réponse.</p>}
      <Link className="lien-discret" href={`/locataire/${orgId}/demandes#demande-${rv.incident_id}`}>Voir l’intervention</Link>
    </div>
  </section>;
}
