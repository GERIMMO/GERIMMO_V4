"use client";

import Link from "next/link";
import { useActionState } from "react";
import { declarerMonIncident, type EtatIncidentAction } from "@/app/actions/incidents";
import { CATEGORIES_INCIDENT, PIECES_INCIDENT } from "@/lib/incidents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// La photo est le PREMIER champ, avant la description (RM-19.2.2). Aucun
// aperçu « qui paiera » ici : le locataire est informé après la décision du
// gérant, pas avant (RM-7.2.1/7.2.4 — écart assumé avec la maquette).
export function FormulaireIncidentLocataire({ orgId }: { orgId: string }) {
  const actionLiee = declarerMonIncident.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  if (etat.succes) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
        {etat.avertissement && (
          <p className="text-sm text-warning-soft-foreground">{etat.avertissement}</p>
        )}
        <Link
          href={`/locataire/${orgId}`}
          className="inline-block text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
        >
          Revenir à mon espace
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="photos">Photos (jusqu&apos;à 5)</Label>
        <Input id="photos" name="photos" type="file" accept="image/jpeg,image/png" multiple />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categorie">De quoi s&apos;agit-il ? *</Label>
        <select id="categorie" name="categorie" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            Choisissez la catégorie la plus proche…
          </option>
          {CATEGORIES_INCIDENT.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.libelle}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="piece">Dans quelle pièce ?</Label>
        <select id="piece" name="piece" defaultValue="" className={classeSelect}>
          <option value="">—</option>
          {PIECES_INCIDENT.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Décrivez en quelques mots *</Label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          placeholder="Depuis quand, où exactement, est-ce que cela s'aggrave…"
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="anciennete">Depuis quand ?</Label>
        <Input id="anciennete" name="anciennete" placeholder="« Depuis dimanche »" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="urgence">Est-ce urgent ?</Label>
        <select id="urgence" name="urgence" defaultValue="normale" className={classeSelect}>
          <option value="normale">Non, cela peut attendre quelques jours</option>
          <option value="urgente">Oui, dégât en cours ou logement inutilisable</option>
        </select>
      </div>

      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? "Envoi…" : "Envoyer le signalement"}
      </Button>
    </form>
  );
}
