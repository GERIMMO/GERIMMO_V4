"use client";

import { useId, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import {
  annulerRdvLocataire,
  demanderReportRdv,
  retirerDemandeRdv,
} from "@/app/actions/incidents-locataire";
import type { EtatIncidentAction } from "@/app/actions/incidents";
import { CleEnvoi } from "@/components/cle-envoi";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";
import {
  etatDemandeLocataire,
  MOTIFS_RDV,
  PRECISION_MAX,
  raisonSansReport,
  REGLES_RDV_LOCATAIRE,
  type RendezVousLocataire,
} from "@/lib/rendez-vous-locataire";
import { CRENEAUX_MINIMUM, DEMI_JOURNEES } from "./creneaux";

// ════════════════════════════════════════════════════════════════════════════
// « JE NE PEUX PLUS ÊTRE LÀ » (décision D22 du 14/10/2026, option B)
//
// Sous le rendez-vous confirmé, un seul bouton secondaire ; il ouvre deux
// chemins (fiche C.8) :
//  · Reporter : motif, trois disponibilités (date + demi-journée, le composant
//    des contre-propositions), et la phrase qui rassure : le rendez-vous actuel
//    reste valable tant que l'artisan n'a pas répondu ;
//  · Annuler le rendez-vous : motif, puis une confirmation à deux temps (une
//    case à cocher, l'envoi ensuite).
// Ce que la base calcule (`report_possible`, `annulation_possible`) décide des
// boutons montrés ; quand le report n'est plus possible, on dit pourquoi au lieu
// de montrer un bouton qui échouerait.
//
// Gabarit : le téléphone, 390 px ; cibles de 44 px.
// ════════════════════════════════════════════════════════════════════════════

function ChampMotif({ id, valeurs }: { id: string; valeurs?: Record<string, string> }) {
  return (
    <>
      <Label htmlFor={`${id}-motif`} className="mb-1 text-xs">
        Motif
      </Label>
      <select
        id={`${id}-motif`}
        name="motif"
        required
        defaultValue={valeurs?.motif ?? ""}
        className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="" disabled>
          Choisissez un motif
        </option>
        {MOTIFS_RDV.map((m) => (
          <option key={m.valeur} value={m.valeur}>
            {m.libelle}
          </option>
        ))}
      </select>
      <Label htmlFor={`${id}-precision`} className="mt-2.5 mb-1 text-xs">
        Une précision pour l&apos;artisan et votre gestionnaire (facultatif)
      </Label>
      <textarea
        id={`${id}-precision`}
        name="precision"
        rows={2}
        maxLength={PRECISION_MAX}
        defaultValue={valeurs?.precision}
        className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
      />
    </>
  );
}

function FormulaireReport({
  orgId,
  interventionId,
  rdvTexte,
  onRevenir,
}: {
  orgId: string;
  interventionId: string;
  rdvTexte: string;
  onRevenir: () => void;
}) {
  const id = useId();
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(
    demanderReportRdv.bind(null, orgId, interventionId),
    {}
  );
  // Au plus tôt demain, en date locale (toISOString décalerait d'un jour autour de minuit).
  const lendemain = new Date();
  lendemain.setDate(lendemain.getDate() + 1);
  const demain = `${lendemain.getFullYear()}-${String(lendemain.getMonth() + 1).padStart(2, "0")}-${String(lendemain.getDate()).padStart(2, "0")}`;

  if (etat.succes) return <p className="mt-2 text-sm text-success-soft-foreground">{etat.succes}</p>;

  return (
    <form data-saisie-confirmee action={action} className="mt-2.5">
      <CleEnvoi etat={etat} />
      <p className="mb-2 text-sm">
        Votre rendez-vous du {rdvTexte} reste valable tant que l&apos;artisan n&apos;a pas répondu.
      </p>
      <ChampMotif id={id} valeurs={etat.valeurs} />
      <fieldset className="mt-3 border-0 p-0">
        <legend className="text-sm font-medium">Vos nouvelles disponibilités</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          Donnez-en {CRENEAUX_MINIMUM} : l&apos;artisan en retiendra une, ou vous dira pourquoi aucune ne convient.
        </p>
        <div className="space-y-3">
          {Array.from({ length: CRENEAUX_MINIMUM }, (_, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`${id}-d${i}`} className="mb-1 text-xs">
                  Date {i + 1}
                </Label>
                <input
                  type="date"
                  id={`${id}-d${i}`}
                  name={`date-${i}`}
                  min={demain}
                  required
                  defaultValue={etat.valeurs?.[`date-${i}`]}
                  className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                />
              </div>
              <div className="min-w-0 flex-1">
                <Label htmlFor={`${id}-m${i}`} className="mb-1 text-xs">
                  Moment {i + 1}
                </Label>
                <select
                  id={`${id}-m${i}`}
                  name={`moment-${i}`}
                  defaultValue={etat.valeurs?.[`moment-${i}`] ?? "matin"}
                  className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {DEMI_JOURNEES.map((d) => (
                    <option key={d.valeur} value={d.valeur}>
                      {d.libelle} ({d.plage})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      {etat.erreur && (
        <p className="err !mt-2.5 !mb-0" role="alert">
          {etat.erreur}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <BoutonEnvoi enCoursTexte="Envoi…" size="lg" className="min-h-11">
          Envoyer à l&apos;artisan
        </BoutonEnvoi>
        <button type="button" onClick={onRevenir} className="lien-discret inline-flex min-h-11 items-center">
          Revenir
        </button>
      </div>
    </form>
  );
}

function FormulaireAnnulation({
  orgId,
  interventionId,
  rdvTexte,
  tardive,
  onRevenir,
}: {
  orgId: string;
  interventionId: string;
  rdvTexte: string;
  tardive: boolean;
  onRevenir: () => void;
}) {
  const id = useId();
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(
    annulerRdvLocataire.bind(null, orgId, interventionId),
    {}
  );
  // Confirmation à deux temps : la case cochée active l'envoi.
  const [confirme, setConfirme] = useState(false);

  if (etat.succes) return <p className="mt-2 text-sm text-success-soft-foreground">{etat.succes}</p>;

  return (
    <form data-saisie-confirmee action={action} className="mt-2.5" onReset={() => setConfirme(false)}>
      <CleEnvoi etat={etat} />
      <p className="mb-2 text-sm">
        L&apos;annulation prend effet tout de suite : l&apos;artisan ne viendra pas le {rdvTexte}. Il vous proposera
        d&apos;autres créneaux ; votre gestionnaire est prévenu.
        {tardive
          ? ` Le rendez-vous est dans moins de ${REGLES_RDV_LOCATAIRE.delaiReportHeures} heures : l'annulation reste possible, elle sera notée au dossier.`
          : ""}
      </p>
      <ChampMotif id={id} valeurs={etat.valeurs} />
      <div className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          id={`${id}-confirmation`}
          name="confirmation"
          value="oui"
          checked={confirme}
          onChange={(e) => setConfirme(e.target.checked)}
          className="mt-1 size-5 shrink-0"
        />
        <Label htmlFor={`${id}-confirmation`} className="text-sm font-normal">
          Je confirme l&apos;annulation du rendez-vous du {rdvTexte}.
        </Label>
      </div>
      {etat.erreur && (
        <p className="err !mt-2.5 !mb-0" role="alert">
          {etat.erreur}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <BoutonEnvoi enCoursTexte="Annulation…" size="lg" variant="destructive" disabled={!confirme} className="min-h-11">
          Annuler le rendez-vous
        </BoutonEnvoi>
        <button type="button" onClick={onRevenir} className="lien-discret inline-flex min-h-11 items-center">
          Revenir
        </button>
      </div>
    </form>
  );
}

function RetirerDemande({ orgId, demandeId }: { orgId: string; demandeId: string }) {
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(
    retirerDemandeRdv.bind(null, orgId, demandeId),
    {}
  );
  if (etat.succes) return <p className="mt-2 text-sm text-success-soft-foreground">{etat.succes}</p>;
  return (
    <form data-saisie-confirmee action={action} className="mt-2">
      {etat.erreur && (
        <p className="err !mt-0 !mb-2" role="alert">
          {etat.erreur}
        </p>
      )}
      <BoutonEnvoi enCoursTexte="Retrait…" variant="outline" size="lg" className="min-h-11">
        Retirer ma demande
      </BoutonEnvoi>
    </form>
  );
}

/** L'état de la demande et les gestes possibles, sous le rendez-vous du locataire. */
export function GestesRendezVous({
  orgId,
  rendezVous,
  rdvTexte,
  peutAgir,
}: {
  orgId: string;
  rendezVous: RendezVousLocataire;
  /** Le rendez-vous en toutes lettres (« jeudi 24 septembre, 8 h – 12 h »). */
  rdvTexte: string | null;
  peutAgir: boolean;
}) {
  const [ouvert, setOuvert] = useState<"choix" | "report" | "annulation" | null>(null);
  const etat = etatDemandeLocataire(rendezVous);
  const enAttente = rendezVous.demande_statut === "en_attente" && rendezVous.demande_type === "report";
  const raison = peutAgir ? raisonSansReport(rendezVous) : null;
  const gestes = peutAgir && rdvTexte && rendezVous.annulation_possible && !enAttente;
  // Annulation « tardive » : moins de 24 h avant le rendez-vous (tracée, jamais sanctionnée). C'est la base qui le
  // sait : quand le report n'est plus possible alors qu'il reste des reports et qu'aucune demande n'attend, la seule
  // raison est le délai.
  const tardive = !rendezVous.report_possible && rendezVous.reports_restants > 0 && !enAttente;

  return (
    <div className="mt-2.5">
      {etat && (
        <div
          className={`rounded-[10px] border-l-4 p-3 text-sm ${
            etat.ton === "succes"
              ? "border-l-[var(--success)] bg-[var(--filet-leger)]"
              : etat.ton === "attention"
                ? "border-l-[var(--warning)] bg-[var(--filet-leger)]"
                : "border-l-[var(--marque)] bg-[var(--filet-leger)]"
          }`}
          role="status"
        >
          <p className="font-medium">{etat.titre}</p>
          <p className="mt-0.5 text-muted-foreground">{etat.detail}</p>
          {enAttente && peutAgir && rendezVous.demande_id && (
            <RetirerDemande orgId={orgId} demandeId={rendezVous.demande_id} />
          )}
        </div>
      )}

      {gestes && rdvTexte && ouvert === null && (
        <button
          type="button"
          onClick={() => setOuvert("choix")}
          className="lien-discret mt-2.5 inline-flex min-h-11 items-center"
        >
          Je ne peux plus être là
        </button>
      )}

      {gestes && rdvTexte && ouvert === "choix" && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {rendezVous.report_possible && (
            <button
              type="button"
              onClick={() => setOuvert("report")}
              className="btn-or min-h-11"
            >
              Demander un report
            </button>
          )}
          <button
            type="button"
            onClick={() => setOuvert("annulation")}
            className="lien-discret inline-flex min-h-11 items-center"
          >
            Annuler le rendez-vous
          </button>
          <button
            type="button"
            onClick={() => setOuvert(null)}
            className="lien-discret inline-flex min-h-11 items-center"
          >
            Revenir
          </button>
          {raison && <p className="w-full text-xs text-muted-foreground">{raison}</p>}
        </div>
      )}

      {gestes && rdvTexte && ouvert === "report" && rendezVous.report_possible && (
        <FormulaireReport
          orgId={orgId}
          interventionId={rendezVous.intervention_id}
          rdvTexte={rdvTexte}
          onRevenir={() => setOuvert("choix")}
        />
      )}

      {gestes && rdvTexte && ouvert === "annulation" && (
        <FormulaireAnnulation
          orgId={orgId}
          interventionId={rendezVous.intervention_id}
          rdvTexte={rdvTexte}
          tardive={tardive}
          onRevenir={() => setOuvert("choix")}
        />
      )}
    </div>
  );
}
