"use client";
import { InputDateJour } from "@/components/input-date-jour";

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
import { nomComplet } from "@/lib/roles-personnes";

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
  const [choix, setChoix] = useState("");
  // L'agent déclare l'indivision → la quote-part s'ouvre dès le 1er propriétaire.
  const [indivision, setIndivision] = useState(false);
  // Nouvelle personne : saisie en pop-up (recette 13/08), valeurs reportées
  // dans le formulaire via des champs cachés.
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [nouveau, setNouveau] = useState({ nom: "", prenom: "", email: "" });
  const refNom = useRef<HTMLInputElement>(null);
  const refEmail = useRef<HTMLInputElement>(null);

  const annulerNouveau = () => {
    setModaleOuverte(false);
    setNouveau({ nom: "", prenom: "", email: "" });
    setChoix("");
  };

  // Clic sur le fond : on referme sans perdre une saisie déjà commencée —
  // seule une pop-up vide vaut annulation (revue 13/08).
  const fermerModale = () => {
    if (!nouveau.nom && !nouveau.email) {
      annulerNouveau();
      return;
    }
    setModaleOuverte(false);
  };

  // C : les propriétaires existants remontent en tête ; on garde tout le monde.
  const dejaProprietaires = personnes.filter((p) => proprietairesIds.includes(p.id));
  const autres = personnes.filter((p) => !proprietairesIds.includes(p.id));
  // Quote-part visible dès qu'il y a (ou qu'on déclare) plusieurs propriétaires
  const montrerQuotePart = !premierProprietaire || indivision;

  useEffect(() => {
    if (!etat.succes) return;
    formulaire.current?.reset();
    // Après le rendu, sinon React enchaîne deux passes pour rien.
    const minuterie = setTimeout(() => {
      setIndivision(false);
      setChoix("");
      setNouveau({ nom: "", prenom: "", email: "" });
    }, 0);
    return () => clearTimeout(minuterie);
  }, [etat]);

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
            onChange={(e) => {
              setChoix(e.target.value);
              // « Nouvelle personne » : la saisie se fait dans une pop-up
              if (e.target.value === "nouvelle") setModaleOuverte(true);
            }}
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
            {/* Valeurs saisies dans la pop-up, reportées ici pour l'envoi */}
            <input type="hidden" name="nouveau_nom" value={nouveau.nom} />
            <input type="hidden" name="nouveau_prenom" value={nouveau.prenom} />
            <input type="hidden" name="nouveau_email" value={nouveau.email} />
            {!modaleOuverte && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Nouveau <b>propriétaire mandant</b> : {nomComplet(nouveau)} — {nouveau.email}{" "}
                <button
                  type="button"
                  onClick={() => setModaleOuverte(true)}
                  className="text-[var(--bleu)] underline-offset-2 hover:underline"
                >
                  modifier
                </button>
              </p>
            )}
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="detention-debut">Début de détention</Label>
          <InputDateJour id="detention-debut"   name="date_debut" />
          <p className="text-xs text-muted-foreground">
            Vide = aujourd&apos;hui. La somme active ne peut pas dépasser 100 %
            .
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

      {/* Pop-up « nouveau propriétaire » (recette 13/08) : fiche créée à la
          volée avec le rôle propriétaire mandant — mêmes règles que
          l'assistant (email obligatoire et unique dans l'agence). */}
      {modaleOuverte && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--encre)]/35 p-4"
          onClick={fermerModale}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nouveau propriétaire"
            className="w-full max-w-md border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // Entrée dans un champ valide la pop-up (sans soumettre la
              // détention) — sur un bouton, elle garde son sens ; Échap referme.
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                e.preventDefault();
                if (refNom.current?.reportValidity() && refEmail.current?.reportValidity()) {
                  setModaleOuverte(false);
                }
              }
              if (e.key === "Escape") fermerModale();
            }}
          >
            <div className="bg-[var(--encre)] px-5 py-3.5 text-[var(--sur-encre)]">
              <h3 className="text-[var(--sur-encre)]">Nouveau propriétaire</h3>
              <p className="mono-discret text-[var(--sur-encre)]/75">
                La fiche complète se retrouve dans Personnes.
              </p>
            </div>
            <div className="space-y-3 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="detention-nom">Nom ou raison sociale *</Label>
                <Input
                  id="detention-nom"
                  ref={refNom}
                  required
                  maxLength={120}
                  value={nouveau.nom}
                  onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="detention-prenom">Prénom</Label>
                <Input
                  id="detention-prenom"
                  maxLength={120}
                  value={nouveau.prenom}
                  onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="detention-email">Adresse email *</Label>
                <Input
                  id="detention-email"
                  ref={refEmail}
                  type="email"
                  required
                  maxLength={200}
                  value={nouveau.email}
                  onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Une adresse ne peut appartenir qu&apos;à une seule fiche de
                  l&apos;agence.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={annulerNouveau}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    // Validation native des deux champs obligatoires avant de
                    // refermer — la création réelle part avec la détention.
                    if (!refNom.current?.reportValidity()) return;
                    if (!refEmail.current?.reportValidity()) return;
                    setModaleOuverte(false);
                  }}
                >
                  Valider
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
