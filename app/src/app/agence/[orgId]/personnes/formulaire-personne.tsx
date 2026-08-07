"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { creerPersonne, type EtatPersonne } from "@/app/actions/personnes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LotRattachable = {
  id: string;
  libelle: string; // « Lot 2 — 12 rue des Lilas, Morsang-sur-Orge »
};

type Role = {
  cle: string;
  libelle: string;
  sous: string;
  icone: string;
};

// Assistant « Créer une fiche » (maquette, retour recette 08/08) — deux
// étapes : le rôle d'abord (le choix avance tout seul, on peut revenir),
// l'identité ensuite. Une seule fiche par personne, quel que soit son rôle.
const ROLES: Role[] = [
  { cle: "locataire", libelle: "Locataire", sous: "Occupe un logement", icone: "⌂" },
  {
    cle: "proprietaire_mandant",
    libelle: "Propriétaire mandant",
    sous: "Confie la gestion à l'agence",
    icone: "◈",
  },
  {
    cle: "garant",
    libelle: "Garant",
    sous: "Se porte caution d'un locataire",
    icone: "⚖",
  },
];

export function FormulairePersonne({
  orgId,
  lots,
  estBailleurDirect = false,
}: {
  orgId: string;
  lots: LotRattachable[];
  // Espace propriétaire direct : pas de « propriétaire mandant » — le
  // propriétaire, c'est lui.
  estBailleurDirect?: boolean;
}) {
  const action = creerPersonne.bind(null, orgId);
  const [etat, formAction, enCours] = useActionState<EtatPersonne, FormData>(action, {});
  const formulaire = useRef<HTMLFormElement>(null);

  const [role, setRole] = useState<string | null>(null);
  const [etape, setEtape] = useState<1 | 2>(1);
  const [morale, setMorale] = useState(false);
  const [rechercheLot, setRechercheLot] = useState("");

  const roles = estBailleurDirect
    ? ROLES.filter((r) => r.cle !== "proprietaire_mandant")
    : ROLES;

  useEffect(() => {
    if (etat.succes) {
      formulaire.current?.reset();
      // Fiche créée : l'assistant repart de l'étape 1. Réinitialisation
      // pilotée par la réponse du serveur, pas un état dérivé du rendu.
      /* eslint-disable react-hooks/set-state-in-effect */
      setRole(null);
      setEtape(1);
      setMorale(false);
      setRechercheLot("");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [etat]);

  const estProprio = role === "proprietaire_mandant";
  // Recherche full-texte simple sur le libellé du lot (numéro, adresse, ville)
  const lotsVisibles = rechercheLot
    ? lots.filter((l) =>
        l.libelle
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .includes(
            rechercheLot.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
          )
      )
    : lots;

  // Fil d'étapes de la maquette : deux ronds, le courant en encre
  const rond = (n: 1 | 2, libelle: string) => (
    <span className="flex items-center gap-2">
      <span
        className={`flex size-6 items-center justify-center rounded-full font-[family-name:var(--font-libelles)] text-xs ${
          etape === n
            ? "bg-[var(--encre)] text-[var(--or)] ring-4 ring-[var(--ardoise)]"
            : etape > n
              ? "bg-[var(--success)] text-white"
              : "border border-border bg-card text-muted-foreground"
        }`}
      >
        {etape > n ? "✓" : n}
      </span>
      <span
        className={`text-[11px] ${etape === n ? "font-medium text-[var(--encre)]" : "text-muted-foreground"}`}
      >
        {libelle}
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {rond(1, "Rôle")}
        <span aria-hidden className="h-px flex-1 bg-border" />
        {rond(2, "Identité")}
      </div>

      {etape === 1 && (
        <div className="space-y-2.5">
          {roles.map((r) => (
            <button
              key={r.cle}
              type="button"
              onClick={() => {
                setRole(r.cle);
                setEtape(2); // le choix du rôle avance tout seul
              }}
              className={`flex w-full items-start gap-3.5 border bg-card px-4 py-3.5 text-left transition-all hover:-translate-y-px hover:border-[var(--encre)] ${
                role === r.cle
                  ? "border-l-[3px] border-[var(--encre)] bg-[#FCFAF5]"
                  : "border-border"
              }`}
            >
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center bg-[var(--ardoise)] text-[var(--encre)]"
              >
                {r.icone}
              </span>
              <span>
                <b className="block font-medium">{r.libelle}</b>
                <small className="text-[12.5px] leading-snug text-muted-foreground">
                  {r.sous}
                </small>
              </span>
            </button>
          ))}
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Une seule fiche par personne, quel que soit son rôle. Un
            propriétaire peut être locataire ailleurs.
          </p>
        </div>
      )}

      {etape === 2 && role && (
        <form ref={formulaire} action={formAction} className="space-y-3">
          <input type="hidden" name="role" value={role} />
          <p className="text-sm text-muted-foreground">
            {ROLES.find((r) => r.cle === role)?.libelle}
            {" · "}
            <button
              type="button"
              onClick={() => setEtape(1)}
              className="text-[var(--bleu)] underline-offset-2 hover:underline"
            >
              changer de rôle
            </button>
          </p>

          {estProprio && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="morale"
                checked={morale}
                onChange={(e) => setMorale(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Personne morale (SCI, société…)
            </label>
          )}

          {morale ? (
            <div className="space-y-1.5">
              <Label htmlFor="p-nom">Raison sociale *</Label>
              <Input id="p-nom" name="nom" required maxLength={120} placeholder="SCI Marchand" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="p-nom">Nom *</Label>
                <Input id="p-nom" name="nom" required maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-prenom">Prénom *</Label>
                <Input id="p-prenom" name="prenom" required maxLength={120} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Adresse email *</Label>
            <Input id="p-email" name="email" type="email" required maxLength={200} />
            <p className="text-xs text-muted-foreground">
              Une adresse ne peut appartenir qu&apos;à une seule fiche de
              l&apos;agence.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-tel">Téléphone</Label>
            <Input id="p-tel" name="telephone" maxLength={40} />
          </div>
          {!morale && (
            <div className="space-y-1.5">
              <Label htmlFor="p-naissance">Date de naissance</Label>
              <Input id="p-naissance" name="date_naissance" type="date" />
            </div>
          )}

          {estProprio ? (
            <div className="space-y-1.5">
              <Label htmlFor="p-lot">Rattacher à un lot de l&apos;agence</Label>
              <Input
                type="search"
                value={rechercheLot}
                onChange={(e) => setRechercheLot(e.target.value)}
                placeholder="Filtrer : adresse, lot, ville…"
                aria-label="Filtrer les lots"
              />
              <select
                id="p-lot"
                name="lot_id"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">— À rattacher plus tard —</option>
                {lotsVisibles.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.libelle}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Facultatif. Le propriétaire devient détenteur du lot (100 % —
                les quote-parts se règlent sur la fiche du lot).
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {role === "locataire"
                ? "Le rattachement d'un locataire à un lot se fait par le bail, depuis la fiche du lot."
                : "Le garant se rattache au bail du locataire qu'il cautionne, à la création du bail."}
            </p>
          )}

          {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
          {etat.succes && (
            <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEtape(1)}
            >
              Retour
            </Button>
            <Button type="submit" size="sm" disabled={enCours} className="flex-1">
              {enCours ? "Création…" : "Créer la fiche"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
