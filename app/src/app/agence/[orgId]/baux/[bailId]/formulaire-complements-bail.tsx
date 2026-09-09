"use client";

import { useActionState } from "react";
import { modifierComplementsBail, type EtatBail } from "@/app/actions/baux";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eur, formaterDate } from "@/lib/ged";

// Valeurs actuelles du bail — la page les lit dans son select `baux` et les
// passe telles quelles.
export type ComplementsBailDefauts = {
  fixation_loyer: string | null;
  paiement_echeance: string; // 'echoir' | 'echu'
  lieu_paiement: string | null;
  irl_valeur: number | null;
  duree_reduite_evenement: string | null;
  travaux_recents: string | null;
  travaux_recents_montant: number | null;
  travaux_locataire: string | null;
  honoraires_bailleur: number | null;
  honoraires_locataire: number | null;
  clauses_particulieres: string | null;
  loyer_reference: number | null;
  loyer_reference_majore: number | null;
  complement_loyer: number | null;
  complement_justification: string | null;
  dernier_loyer: number | null;
  dernier_loyer_versement: string | null;
  dernier_loyer_revision: string | null;
  meuble_etudiant: boolean;
};

// Modalités de fixation initiale du loyer (contrat type, décret 2015-587).
const FIXATIONS: Record<string, string> = {
  libre: "Librement fixé",
  plafonnement: "Plafonnement en zone d'encadrement",
  reevaluation: "Réévaluation après travaux",
};

const classeSelect = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
const classeTextarea =
  "w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm";

// Compléments du contrat : les conditions détaillées que le contrat type
// imprime. Tous les champs sont facultatifs (règle d'honnêteté 31/08 : un vide
// s'imprime en libellé d'épreuve ou en « — », il ne bloque jamais la
// génération). Le bloc « zone tendue » n'apparaît que si le bien y est, le
// bail étudiant que pour un meublé, les honoraires que pour une agence.
export function FormulaireComplementsBail({
  orgId,
  bailId,
  defauts,
  zoneTendue,
  meuble,
  agence,
  modifiable,
}: {
  orgId: string;
  bailId: string;
  defauts: ComplementsBailDefauts;
  zoneTendue: boolean;
  meuble: boolean;
  agence: boolean;
  modifiable: boolean;
}) {
  const action = modifierComplementsBail.bind(null, orgId, bailId);
  const [etat, formAction] = useActionState<EtatBail, FormData>(action, {});

  // Le contrat signé fige ses conditions : passé le brouillon, lecture seule.
  if (!modifiable) {
    const montant = (v: number | null) => (v == null ? "—" : eur(v));
    const lignes: [string, string][] = [
      [
        "Fixation initiale du loyer",
        defauts.fixation_loyer ? FIXATIONS[defauts.fixation_loyer] ?? defauts.fixation_loyer : "—",
      ],
      ["Paiement du loyer", defauts.paiement_echeance === "echu" ? "À terme échu" : "À échoir"],
      ["Lieu de paiement", defauts.lieu_paiement ?? "—"],
      ["Valeur de l'IRL de référence", defauts.irl_valeur == null ? "—" : String(defauts.irl_valeur)],
      ["Événement justifiant une durée réduite", defauts.duree_reduite_evenement ?? "—"],
      ["Travaux récents du bailleur", defauts.travaux_recents ?? "—"],
      ["Montant des travaux récents", montant(defauts.travaux_recents_montant)],
      ["Travaux à la charge du locataire", defauts.travaux_locataire ?? "—"],
      ...(agence
        ? ([
            ["Honoraires à la charge du bailleur", montant(defauts.honoraires_bailleur)],
            ["Honoraires à la charge du locataire", montant(defauts.honoraires_locataire)],
          ] as [string, string][])
        : []),
      ["Clauses particulières", defauts.clauses_particulieres ?? "—"],
      ...(zoneTendue
        ? ([
            ["Loyer de référence", montant(defauts.loyer_reference)],
            ["Loyer de référence majoré", montant(defauts.loyer_reference_majore)],
            ["Complément de loyer", montant(defauts.complement_loyer)],
            ["Justification du complément", defauts.complement_justification ?? "—"],
            ["Dernier loyer de l'ancien locataire", montant(defauts.dernier_loyer)],
            ["Dernier versement", formaterDate(defauts.dernier_loyer_versement)],
            ["Dernière révision", formaterDate(defauts.dernier_loyer_revision)],
          ] as [string, string][])
        : []),
      ...(meuble
        ? ([["Bail étudiant (9 mois)", defauts.meuble_etudiant ? "Oui" : "Non"]] as [
            string,
            string,
          ][])
        : []),
    ];
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          Le contrat a avancé — ces conditions sont figées.
        </p>
        <div className="mt-2">
          {lignes.map(([libelle, valeur]) => (
            <div key={libelle} className="ligne-info">
              <span>{libelle}</span>
              <span className="min-w-0 text-right">{valeur}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Repose de la saisie en erreur (recette 22/08) : etat.valeurs prime sur les
  // défauts du brouillon — y compris un champ volontairement vidé ("").
  const d = (nom: string, defaut: string | number | null) =>
    etat.valeurs?.[nom] ?? (defaut == null ? "" : String(defaut));

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="comp-fixation">Fixation initiale du loyer</Label>
          <select
            id="comp-fixation"
            name="fixation_loyer"
            defaultValue={d("fixation_loyer", defauts.fixation_loyer)}
            className={classeSelect}
          >
            <option value="">—</option>
            <option value="libre">Librement fixé</option>
            <option value="plafonnement">Plafonnement en zone d&apos;encadrement</option>
            <option value="reevaluation">Réévaluation après travaux</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-echeance">Paiement du loyer</Label>
          <select
            id="comp-echeance"
            name="paiement_echeance"
            defaultValue={d("paiement_echeance", defauts.paiement_echeance || "echoir")}
            className={classeSelect}
          >
            <option value="echoir">À échoir (d&apos;avance)</option>
            <option value="echu">À terme échu</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-lieu">Lieu de paiement</Label>
          <Input
            id="comp-lieu"
            name="lieu_paiement"
            maxLength={200}
            placeholder="Virement au bailleur, au siège de l'agence…"
            defaultValue={d("lieu_paiement", defauts.lieu_paiement)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-irl-valeur">Valeur de l&apos;IRL de référence</Label>
          <Input
            id="comp-irl-valeur"
            name="irl_valeur"
            type="number"
            step="0.01"
            min="0"
            placeholder="ex. 145,17"
            defaultValue={d("irl_valeur", defauts.irl_valeur)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="comp-duree-reduite">
            Événement justifiant une durée réduite (le cas échéant)
          </Label>
          <Input
            id="comp-duree-reduite"
            name="duree_reduite_evenement"
            maxLength={500}
            placeholder="Raison familiale ou professionnelle précise du bailleur"
            defaultValue={d("duree_reduite_evenement", defauts.duree_reduite_evenement)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="comp-travaux">Travaux récents du bailleur (nature)</Label>
          <textarea
            id="comp-travaux"
            name="travaux_recents"
            rows={2}
            maxLength={2000}
            placeholder="Travaux d'amélioration depuis le dernier contrat ou les 6 derniers mois"
            defaultValue={d("travaux_recents", defauts.travaux_recents)}
            className={classeTextarea}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-travaux-montant">Montant des travaux récents (€)</Label>
          <Input
            id="comp-travaux-montant"
            name="travaux_recents_montant"
            type="number"
            step="0.01"
            min="0"
            defaultValue={d("travaux_recents_montant", defauts.travaux_recents_montant)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="comp-travaux-locataire">Travaux à la charge du locataire</Label>
          <textarea
            id="comp-travaux-locataire"
            name="travaux_locataire"
            rows={2}
            maxLength={2000}
            placeholder="Travaux que le locataire s'engage à réaliser (contrepartie éventuelle)"
            defaultValue={d("travaux_locataire", defauts.travaux_locataire)}
            className={classeTextarea}
          />
        </div>
        {agence && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="comp-hono-bailleur">Honoraires à la charge du bailleur (€)</Label>
              <Input
                id="comp-hono-bailleur"
                name="honoraires_bailleur"
                type="number"
                step="0.01"
                min="0"
                defaultValue={d("honoraires_bailleur", defauts.honoraires_bailleur)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-hono-locataire">Honoraires à la charge du locataire (€)</Label>
              <Input
                id="comp-hono-locataire"
                name="honoraires_locataire"
                type="number"
                step="0.01"
                min="0"
                defaultValue={d("honoraires_locataire", defauts.honoraires_locataire)}
              />
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="comp-clauses">Clauses particulières</Label>
          <textarea
            id="comp-clauses"
            name="clauses_particulieres"
            rows={3}
            maxLength={4000}
            placeholder="Clauses ajoutées d'un commun accord — vide : « Néant » au contrat"
            defaultValue={d("clauses_particulieres", defauts.clauses_particulieres)}
            className={classeTextarea}
          />
        </div>
        {zoneTendue && (
          <>
            <p className="border-t border-border pt-3 text-sm font-medium sm:col-span-2">
              Zone tendue — encadrement des loyers
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="comp-loyer-ref">Loyer de référence (€/m²)</Label>
              <Input
                id="comp-loyer-ref"
                name="loyer_reference"
                type="number"
                step="0.01"
                min="0"
                defaultValue={d("loyer_reference", defauts.loyer_reference)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-loyer-ref-majore">Loyer de référence majoré (€/m²)</Label>
              <Input
                id="comp-loyer-ref-majore"
                name="loyer_reference_majore"
                type="number"
                step="0.01"
                min="0"
                defaultValue={d("loyer_reference_majore", defauts.loyer_reference_majore)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-complement">Complément de loyer (€)</Label>
              <Input
                id="comp-complement"
                name="complement_loyer"
                type="number"
                step="0.01"
                min="0"
                defaultValue={d("complement_loyer", defauts.complement_loyer)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-complement-justif">Justification du complément</Label>
              <Input
                id="comp-complement-justif"
                name="complement_justification"
                maxLength={500}
                placeholder="Caractéristiques exceptionnelles du logement"
                defaultValue={d("complement_justification", defauts.complement_justification)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-dernier-loyer">
                Dernier loyer de l&apos;ancien locataire (€)
              </Label>
              <Input
                id="comp-dernier-loyer"
                name="dernier_loyer"
                type="number"
                step="0.01"
                min="0"
                defaultValue={d("dernier_loyer", defauts.dernier_loyer)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-dernier-versement">Date du dernier versement</Label>
              <Input
                id="comp-dernier-versement"
                name="dernier_loyer_versement"
                type="date"
                defaultValue={d("dernier_loyer_versement", defauts.dernier_loyer_versement)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-derniere-revision">Date de la dernière révision</Label>
              <Input
                id="comp-derniere-revision"
                name="dernier_loyer_revision"
                type="date"
                defaultValue={d("dernier_loyer_revision", defauts.dernier_loyer_revision)}
              />
            </div>
          </>
        )}
        {meuble && (
          <div className="flex items-center gap-2 pt-1 sm:col-span-2">
            <input
              id="comp-etudiant"
              name="meuble_etudiant"
              type="checkbox"
              value="on"
              defaultChecked={
                etat.valeurs ? etat.valeurs.meuble_etudiant === "on" : defauts.meuble_etudiant
              }
              className="size-4"
            />
            <Label htmlFor="comp-etudiant">
              Bail étudiant — 9 mois, non reconduit tacitement
            </Label>
          </div>
        )}
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <BoutonEnvoi enCoursTexte="Enregistrement…" size="sm" variant="outline">
        Enregistrer les compléments
      </BoutonEnvoi>
    </form>
  );
}
