"use client";

import { eur, formaterDate } from "@/lib/ged";
import { InputDateJour } from "@/components/input-date-jour";

import { useActionState } from "react";
import {
  demarrerRestitution,
  ajouterRetenue,
  supprimerRetenue,
  finaliserDecompte,
  justifierRetenue,
  marquerDecompteEnvoye,
  type EtatRestit,
} from "@/app/actions/restitution";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Restitution = {
  id: string;
  date_remise_cles: string;
  delai_mois: number;
  depot: number;
  impayes: number;
  sans_edl_entree: boolean;
  statut: string;
  solde: number | null;
  date_emission: string | null;
  envoye_le: string | null;
};
export type Retenue = {
  id: string;
  libelle: string;
  cout: number;
  duree_vie_ans: number | null;
  age_ans: number | null;
  montant_retenu: number;
  sans_justificatif: boolean;
};

// Durées de vie indicatives (barème de vétusté usuel) — aide à la saisie.
const BAREME: { poste: string; ans: number }[] = [
  { poste: "Peinture / papier peint", ans: 7 },
  { poste: "Moquette / sol souple", ans: 7 },
  { poste: "Parquet vitrifié", ans: 10 },
  { poste: "Électroménager", ans: 5 },
  { poste: "Robinetterie", ans: 10 },
  { poste: "Volets / stores", ans: 15 },
];

export function FormulaireRestitution({
  orgId,
  bailId,
  restitution,
  retenues,
}: {
  orgId: string;
  bailId: string;
  restitution: Restitution | null;
  retenues: Retenue[];
}) {
  if (!restitution) return <FormDemarrer orgId={orgId} bailId={bailId} />;

  const totalRetenues = retenues.reduce((s, r) => s + Number(r.montant_retenu), 0);
  const soldeProjete = Number(restitution.depot) - Number(restitution.impayes) - totalRetenues;
  const finalise = restitution.statut === "finalise";

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Dépôt de garantie</dt>
          <dd className="font-medium">{eur(restitution.depot)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Impayés imputés</dt>
          <dd className="font-medium">{eur(restitution.impayes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Retenues</dt>
          <dd className="font-medium">{eur(totalRetenues)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Délai légal ({restitution.delai_mois} mois)
          </dt>
          <dd className="font-medium">
            {finalise && restitution.solde != null ? eur(restitution.solde) : eur(soldeProjete)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {(finalise ? restitution.solde ?? 0 : soldeProjete) < 0 ? "créance locataire" : "à restituer"}
            </span>
          </dd>
        </div>
      </dl>

      {restitution.sans_edl_entree && (
        <p className="border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Sans état des lieux d&apos;entrée signé, aucune retenue n&apos;est possible :
          restitution intégrale du dépôt.
        </p>
      )}

      {retenues.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {retenues.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.libelle}</span>
              <span className="text-xs text-muted-foreground">
                {eur(r.cout)}
                {r.duree_vie_ans
                  ? ` · vétusté ${r.age_ans ?? 0}/${r.duree_vie_ans} ans`
                  : " · neuf/dégradation totale"}
              </span>
              <span className="w-24 text-right font-medium">{eur(r.montant_retenu)}</span>
              {!finalise && <BoutonSupprimerRetenue orgId={orgId} bailId={bailId} retenueId={r.id} />}
              {r.sans_justificatif && (
                <FormJustifierRetenue orgId={orgId} bailId={bailId} retenue={r} />
              )}
            </li>
          ))}
        </ul>
      )}

      {!finalise && !restitution.sans_edl_entree && (
        <FormRetenue orgId={orgId} bailId={bailId} restitutionId={restitution.id} />
      )}

      {finalise ? (
        <div className="space-y-2">
          <p className="text-sm text-success-soft-foreground">
            Décompte finalisé{restitution.date_emission ? ` le ${formaterDate(restitution.date_emission)}` : ""}.
            Solde de tout compte :{" "}
            <span className="font-semibold">{eur(restitution.solde ?? 0)}</span>.
          </p>
          {restitution.envoye_le ? (
            <p className="text-sm text-success-soft-foreground">
              Décompte envoyé au locataire le {formaterDate(restitution.envoye_le)}.
            </p>
          ) : (
            <FormDecompteEnvoye orgId={orgId} bailId={bailId} restitutionId={restitution.id} />
          )}
        </div>
      ) : (
        <BoutonFinaliser orgId={orgId} bailId={bailId} restitutionId={restitution.id} />
      )}
    </div>
  );
}

function FormDemarrer({ orgId, bailId }: { orgId: string; bailId: string }) {
  const [etat, action, enCours] = useActionState<EtatRestit, FormData>(
    demarrerRestitution.bind(null, orgId, bailId),
    {}
  );
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Le délai de restitution court à compter de la remise des clés : 1 mois si
        l&apos;état des lieux de sortie est conforme à l&apos;entrée, 2 mois sinon.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="rst-date" className="text-xs">Remise des clés</Label>
          <InputDateJour id="rst-date"   className="h-9" name="date_remise_cles" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          {/* En erreur, la case cochée est reposée via etat.valeurs (recette 22/08) */}
          <input type="checkbox" name="conforme" defaultChecked={etat.valeurs ? etat.valeurs.conforme === "on" : false} className="size-4" />
          Sortie conforme à l&apos;entrée (délai 1 mois)
        </label>
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? "…" : "Démarrer la restitution"}
        </Button>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

function FormRetenue({
  orgId,
  bailId,
  restitutionId,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
}) {
  const [etat, action, enCours] = useActionState<EtatRestit, FormData>(
    ajouterRetenue.bind(null, orgId, bailId, restitutionId),
    {}
  );
  return (
    <form action={action} className="space-y-2 border border-dashed border-border p-3">
      <p className="text-sm font-medium">Ajouter une retenue (décote de vétusté)</p>
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
      <div className="flex flex-wrap items-end gap-2">
        <Input name="libelle" placeholder="Ex. remise en peinture séjour" defaultValue={etat.valeurs?.libelle} className="h-9 w-56" />
        <div className="space-y-1">
          <Label htmlFor="ret-cout" className="text-xs">Coût (€)</Label>
          <Input id="ret-cout" name="cout" type="number" step="0.01" min="0.01" defaultValue={etat.valeurs?.cout} className="h-9 w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ret-duree" className="text-xs">Durée de vie (ans)</Label>
          <Input id="ret-duree" name="duree_vie" type="number" step="1" min="1" list="bareme-vetuste" defaultValue={etat.valeurs?.duree_vie} className="h-9 w-28" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ret-age" className="text-xs">Âge (ans)</Label>
          <Input id="ret-age" name="age" type="number" step="1" min="0" defaultValue={etat.valeurs?.age} className="h-9 w-20" />
        </div>
      </div>
      <datalist id="bareme-vetuste">
        {BAREME.map((b) => (
          <option key={b.poste} value={b.ans}>{b.poste}</option>
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="justificatif" type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-9 w-64 text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "…" : "Ajouter la retenue"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Retenue = coût × (durée de vie − âge) / durée de vie. Laisser durée de vie
        vide pour retenir le coût intégral (dégradation, non-vétusté).
      </p>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

function BoutonSupprimerRetenue({
  orgId,
  bailId,
  retenueId,
}: {
  orgId: string;
  bailId: string;
  retenueId: string;
}) {
  const [, action, enCours] = useActionState(
    async () => supprimerRetenue(orgId, bailId, retenueId),
    { }
  );
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="ghost" disabled={enCours} className="text-xs text-destructive">
        Retirer
      </Button>
    </form>
  );
}

// Sans justificatif, la retenue est difficilement défendable : on peut en
// joindre un après coup — l'alerte liée se ferme d'elle-même.
function FormJustifierRetenue({
  orgId,
  bailId,
  retenue,
}: {
  orgId: string;
  bailId: string;
  retenue: Retenue;
}) {
  const [etat, action, enCours] = useActionState<EtatRestit, FormData>(
    justifierRetenue.bind(null, orgId, bailId, retenue.id, retenue.libelle),
    {}
  );
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 pl-1">
      <span className="text-xs text-destructive">Sans justificatif</span>
      <Input
        name="justificatif"
        type="file"
        accept=".pdf,image/*"
        required
        className="h-8 max-w-xs text-xs"
        aria-label={`Justificatif pour ${retenue.libelle}`}
      />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Joindre le devis / la facture"}
      </Button>
      {etat.erreur && <span className="w-full text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="w-full text-xs text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

// L'envoi du décompte est l'événement qui ferme l'alerte « décompte à envoyer »
function FormDecompteEnvoye({
  orgId,
  bailId,
  restitutionId,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
}) {
  const [etat, action, enCours] = useActionState<EtatRestit, FormData>(
    marquerDecompteEnvoye.bind(null, orgId, bailId, restitutionId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="decompte-envoye-date" className="text-xs">
          Envoyé au locataire le
        </Label>
        <InputDateJour id="decompte-envoye-date" name="date" required />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Décompte envoyé"}
      </Button>
      {etat.erreur && <span className="w-full text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="w-full text-sm text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

function BoutonFinaliser({
  orgId,
  bailId,
  restitutionId,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
}) {
  const [etat, action, enCours] = useActionState<EtatRestit, FormData>(
    async () => finaliserDecompte(orgId, bailId, restitutionId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "…" : "Finaliser le décompte"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Fige le solde de tout compte et crée l&apos;alerte d&apos;envoi.
      </span>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-sm text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}
