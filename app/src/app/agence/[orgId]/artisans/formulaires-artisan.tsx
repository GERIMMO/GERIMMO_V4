"use client";

import { useActionState, useId } from "react";
import {
  blacklisterArtisanLocal,
  creerOuRattacherArtisan,
  definirMetiersEtZones,
  definirStatutLocalArtisan,
  leverBlacklistArtisanLocal,
  type EtatArtisanAction,
} from "./actions";
import { METIERS_ARTISAN } from "./referentiel";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Formulaires du carnet d'artisans. Chaque champ porte un libellé VISIBLE —
// le placeholder disparaît à la première frappe, ce n'est pas un nom
// accessible (e2e/a11y.spec.ts le vérifie et rougit sinon).

function Retour({ etat }: { etat: EtatArtisanAction }) {
  return (
    <>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </>
  );
}

// Métiers et zone : le même bloc à la création et à la correction — deux
// copies auraient divergé dès la première évolution de la liste fermée.
function ChampsMetiersEtZones({
  metiers,
  codes,
  valeurs,
}: {
  metiers?: string[];
  codes?: string[];
  valeurs?: Record<string, string>;
}) {
  const idCodes = useId();
  const coches = new Set(metiers ?? []);
  return (
    <>
      <fieldset className="space-y-1">
        <legend className="libelle-champ">Métiers *</legend>
        <p className="text-xs text-muted-foreground">
          Il ne vous sera proposé que dans les métiers cochés (RM-8.3).
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {Object.entries(METIERS_ARTISAN).map(([valeur, libelle]) => (
            // Rangée large : une case native de 13 px se coche mal au doigt
            <label key={valeur} className="flex items-center gap-2 py-1.5 text-sm">
              <input
                type="checkbox"
                name="metiers"
                value={valeur}
                defaultChecked={coches.has(valeur)}
                className="size-4 shrink-0 accent-[var(--encre)]"
              />
              {libelle}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={idCodes}>Zone d&apos;intervention — codes postaux</Label>
        <Input
          id={idCodes}
          name="codes_postaux"
          inputMode="numeric"
          defaultValue={valeurs?.codes_postaux ?? (codes ?? []).join(" ")}
          placeholder="75011 75012 93100"
        />
        <p className="text-xs text-muted-foreground">
          Séparés par un espace ou une virgule. Comparaison exacte au code postal
          du bien : laissez vide pour ne poser aucune limite de zone.
        </p>
      </div>
    </>
  );
}

export function FormulaireNouvelArtisan({ orgId }: { orgId: string }) {
  const actionLiee = creerOuRattacherArtisan.bind(null, orgId);
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(actionLiee, {});
  const idRaison = useId();
  const idSiret = useId();
  const idTel = useId();
  const idEmail = useId();

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={idRaison}>Raison sociale *</Label>
          <Input
            id={idRaison}
            name="raison_sociale"
            required
            defaultValue={etat.valeurs?.raison_sociale}
            placeholder="Plomberie Martin SARL"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idSiret}>SIRET *</Label>
          <Input
            id={idSiret}
            name="siret"
            required
            inputMode="numeric"
            defaultValue={etat.valeurs?.siret}
            placeholder="123 456 789 00012"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idTel}>Téléphone mobile *</Label>
          <Input
            id={idTel}
            name="telephone"
            type="tel"
            required
            defaultValue={etat.valeurs?.telephone}
            placeholder="06 12 34 56 78"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idEmail}>Courriel</Label>
          <Input
            id={idEmail}
            name="email"
            type="email"
            defaultValue={etat.valeurs?.email}
            placeholder="contact@plomberie-martin.fr"
          />
        </div>
      </div>
      <ChampsMetiersEtZones valeurs={etat.valeurs} />
      <Retour etat={etat} />
      <BoutonEnvoi enCoursTexte="Enregistrement…">Enregistrer l&apos;artisan</BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        Le SIRET identifie l&apos;entreprise chez Gerimmo : s&apos;il existe déjà, sa
        fiche vous est rattachée au lieu d&apos;être dupliquée. C&apos;est ensuite
        l&apos;artisan qui dépose ses attestations et choisit sa visibilité — vous
        n&apos;avez pas à collecter ses pièces.
      </p>
    </form>
  );
}

export function FormulaireMetiersZones({
  orgId,
  artisanId,
  metiers,
  codes,
}: {
  orgId: string;
  artisanId: string;
  metiers: string[];
  codes: string[];
}) {
  const actionLiee = definirMetiersEtZones.bind(null, orgId, artisanId);
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-3">
      <ChampsMetiersEtZones metiers={metiers} codes={codes} valeurs={etat.valeurs} />
      <Retour etat={etat} />
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Enregistrement…">
        Enregistrer
      </BoutonEnvoi>
    </form>
  );
}

// RM-8.5.1 : geste NEUTRE, sans motif — c'est ce qui le distingue de la liste
// noire. Le formulaire n'a donc aucun champ, et c'est voulu.
export function BoutonStatutLocal({
  orgId,
  artisanId,
  actif,
}: {
  orgId: string;
  artisanId: string;
  actif: boolean;
}) {
  const actionLiee = definirStatutLocalArtisan.bind(null, orgId, artisanId, !actif);
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-2">
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
        {actif ? "Désactiver dans mon carnet" : "Réactiver"}
      </BoutonEnvoi>
      <Retour etat={etat} />
    </form>
  );
}

export function FormulaireBlacklistLocale({
  orgId,
  artisanId,
}: {
  orgId: string;
  artisanId: string;
}) {
  const actionLiee = blacklisterArtisanLocal.bind(null, orgId, artisanId);
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(actionLiee, {});
  const idMotif = useId();

  return (
    <form action={action} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={idMotif}>Motif de la liste noire *</Label>
        <Input
          id={idMotif}
          name="motif"
          required
          defaultValue={etat.valeurs?.motif}
          placeholder="Chantier abandonné le 12/03, locataire sans eau chaude 8 jours."
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
        Inscrire sur ma liste noire
      </BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        Le motif est conservé trois ans, puis purgé — et la mesure tombe avec
        lui. Elle n&apos;engage que votre agence. Impossible tant qu&apos;une
        intervention est en cours.
      </p>
    </form>
  );
}

export function BoutonLeverBlacklist({
  orgId,
  artisanId,
}: {
  orgId: string;
  artisanId: string;
}) {
  const actionLiee = leverBlacklistArtisanLocal.bind(null, orgId, artisanId);
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-2">
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
        Lever la liste noire
      </BoutonEnvoi>
      <Retour etat={etat} />
    </form>
  );
}
