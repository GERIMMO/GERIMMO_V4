"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  ajouterDetention,
  cloreDetention,
  supprimerDetention,
  rouvrirDetention,
  type EtatParc,
} from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Personne = { id: string; nom: string; prenom: string | null };

export function FormulaireDetention({
  orgId,
  bienId,
  lotId,
  personnes,
  proprietairesIds,
  premierProprietaire,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  personnes: Personne[];
  proprietairesIds: string[];
  premierProprietaire: boolean;
}) {
  const actionLiee = ajouterDetention.bind(null, orgId, bienId, lotId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const formulaire = useRef<HTMLFormElement>(null);
  const [choix, setChoix] = useState(personnes.length > 0 ? "" : "nouvelle");
  // L'agent déclare l'indivision → la quote-part s'ouvre dès le 1er propriétaire.
  const [indivision, setIndivision] = useState(false);

  // C : les propriétaires existants remontent en tête ; on garde tout le monde.
  const nomComplet = (p: Personne) => `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}`;
  const dejaProprietaires = personnes.filter((p) => proprietairesIds.includes(p.id));
  const autres = personnes.filter((p) => !proprietairesIds.includes(p.id));
  // Quote-part visible dès qu'il y a (ou qu'on déclare) plusieurs propriétaires
  const montrerQuotePart = !premierProprietaire || indivision;

  useEffect(() => {
    if (!etat.succes) return;
    formulaire.current?.reset();
    setIndivision(false);
    const minuterie = setTimeout(
      () => setChoix(personnes.length > 0 ? "" : "nouvelle"),
      0
    );
    return () => clearTimeout(minuterie);
  }, [etat, personnes.length]);

  return (
    <form ref={formulaire} action={action} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">
        {premierProprietaire
          ? "Le propriétaire du lot"
          : "Ajouter un co-propriétaire (indivision)"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="detention-personne">Propriétaire</Label>
          <select
            id="detention-personne"
            name="person_id"
            required
            value={choix}
            onChange={(e) => setChoix(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="" disabled>
              — Choisir —
            </option>
            {dejaProprietaires.length > 0 && (
              <optgroup label="Propriétaires existants">
                {dejaProprietaires.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomComplet(p)}
                  </option>
                ))}
              </optgroup>
            )}
            {autres.length > 0 && (
              <optgroup label="Autres personnes">
                {autres.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomComplet(p)}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="nouvelle">+ Nouvelle personne…</option>
          </select>
        </div>
        {premierProprietaire && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={indivision}
              onChange={(e) => setIndivision(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Indivision — plusieurs propriétaires sur ce lot (saisir les quote-parts)
          </label>
        )}
        {montrerQuotePart ? (
          <div className="space-y-1.5">
            <Label htmlFor="detention-quote-part">Quote-part (%)</Label>
            <Input
              id="detention-quote-part"
              name="quote_part"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              required
              placeholder="ex. 50"
            />
          </div>
        ) : (
          // RM variante V1 : un seul propriétaire → 100 % implicite, champ masqué
          <input type="hidden" name="quote_part" value="100" />
        )}
        {choix === "nouvelle" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="detention-nom">Nom</Label>
              <Input id="detention-nom" name="nouveau_nom" required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detention-prenom">Prénom</Label>
              <Input id="detention-prenom" name="nouveau_prenom" maxLength={120} />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="detention-debut">Début de détention</Label>
          <Input id="detention-debut" name="date_debut" type="date" />
          <p className="text-xs text-muted-foreground">
            Vide = aujourd&apos;hui. La somme active ne peut pas dépasser 100 %
            (RM-0.2.1).
          </p>
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer la détention"}
      </Button>
    </form>
  );
}

// Fin de détention : pose date_fin à aujourd'hui, jamais de suppression
export function BoutonCloreDetention({
  orgId,
  bienId,
  lotId,
  detentionId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  detentionId: string;
}) {
  const actionLiee = cloreDetention.bind(null, orgId, bienId, lotId, detentionId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  return (
    <form action={action} className="shrink-0">
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        {enCours ? "…" : "Fermer"}
      </Button>
      {etat.erreur && <p className="text-xs text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Corriger une erreur : supprime la détention (refusé en base si le lot a un bail).
export function BoutonSupprimerDetention({
  orgId,
  bienId,
  lotId,
  detentionId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  detentionId: string;
}) {
  const actionLiee = supprimerDetention.bind(null, orgId, bienId, lotId, detentionId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  return (
    <form action={action} className="shrink-0">
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        {enCours ? "…" : "Corriger"}
      </Button>
      {etat.erreur && <p className="text-xs text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Rouvrir une détention close par erreur (garde-fou 100 % + trace horodatée).
export function BoutonRouvrirDetention({
  orgId,
  bienId,
  lotId,
  detentionId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  detentionId: string;
}) {
  const actionLiee = rouvrirDetention.bind(null, orgId, bienId, lotId, detentionId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  return (
    <form action={action} className="shrink-0">
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        {enCours ? "…" : "Rouvrir"}
      </Button>
      {etat.erreur && <p className="text-xs text-destructive">{etat.erreur}</p>}
    </form>
  );
}
