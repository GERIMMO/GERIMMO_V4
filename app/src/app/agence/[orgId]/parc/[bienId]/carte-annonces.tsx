"use client";

import { useActionState } from "react";
import { creerAnnonce, supprimerAnnonce, type EtatAnnonce } from "@/app/actions/annonces";
import { Button } from "@/components/ui/button";
import { formaterDate } from "@/lib/ged";

export type Annonce = {
  id: string;
  texte: string;
  visible_jusquau: string;
};

function BoutonRetirerAnnonce({
  orgId,
  bienId,
  annonceId,
}: {
  orgId: string;
  bienId: string;
  annonceId: string;
}) {
  const [etat, action, enCours] = useActionState<EtatAnnonce, FormData>(
    async () => supprimerAnnonce(orgId, bienId, annonceId),
    {}
  );
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <Button type="submit" variant="ghost" size="sm" disabled={enCours}>
        {enCours ? "…" : "Retirer"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

// Défaut du champ date : visible une semaine
const dansUneSemaine = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

// Annonce aux locataires du bien (espace locataire v10) : coupure d'eau,
// travaux, passage du syndic — affichée sur leur accueil jusqu'à la date
// choisie, puis elle disparaît seule.
export function CarteAnnonces({
  orgId,
  bienId,
  annonces,
}: {
  orgId: string;
  bienId: string;
  annonces: Annonce[];
}) {
  const [etat, action, enCours] = useActionState<EtatAnnonce, FormData>(
    creerAnnonce.bind(null, orgId, bienId),
    {}
  );

  return (
    <div className="space-y-3">
      {annonces.length > 0 && (
        <ul className="divide-y divide-border">
          {annonces.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                {a.texte}
                <small className="block text-muted-foreground">
                  affichée jusqu&apos;au {formaterDate(a.visible_jusquau)}
                </small>
              </span>
              <BoutonRetirerAnnonce orgId={orgId} bienId={bienId} annonceId={a.id} />
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="space-y-2">
        <textarea
          name="texte"
          rows={2}
          maxLength={500}
          placeholder="Ex. : coupure d'eau jeudi de 9 h à 12 h (entretien des colonnes) — pensez à tirer un peu d'eau la veille."
          defaultValue={etat.valeurs?.texte}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Visible jusqu&apos;au
            <input
              type="date"
              name="visible_jusquau"
              defaultValue={etat.valeurs?.visible_jusquau ?? dansUneSemaine()}
              className="mt-1 block h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
            />
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={enCours}>
            {enCours ? "Publication…" : "Publier l'annonce"}
          </Button>
        </div>
        {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
        {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      </form>
    </div>
  );
}
