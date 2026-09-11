"use client";

import { eur, formaterDate, formaterDateHeure } from "@/lib/ged";
import { InputDateJour } from "@/components/input-date-jour";

import { useActionState, useId, useRef, useState } from "react";
import {
  demarrerRestitution,
  ajouterRetenue,
  supprimerRetenue,
  finaliserDecompte,
  justifierRetenue,
  marquerDecompteEnvoye,
  rafraichirMontantsRestitution,
  type EtatRestit,
} from "@/app/actions/restitution";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modale } from "@/components/ui/modale";

export type Restitution = {
  id: string;
  date_remise_cles: string;
  delai_mois: number;
  depot: number;
  impayes: number;
  // Date à laquelle depot et impayes ont été lus dans la réalité : ce sont des
  // instantanés, pas des calculs permanents.
  montants_arretes_le: string;
  sans_edl_entree: boolean;
  statut: string;
  solde: number | null;
  date_emission: string | null;
  envoye_le: string | null;
};

// Dépôt encaissé et impayés tels qu'ils sont AUJOURD'HUI, pour les confronter à
// l'instantané du décompte. Absent si le bail sort du portefeuille de l'agent.
export type MontantsReels = { depot: number; impayes: number };
export type Retenue = {
  id: string;
  libelle: string;
  cout: number;
  duree_vie_ans: number | null;
  age_ans: number | null;
  montant_retenu: number;
  sans_justificatif: boolean;
};

// Durées de vie indicatives — aide à la saisie, recopiée de la grille par
// défaut de wiki/regles-metier/Vétusté et décote.md (modifiable par l'agence
// au module 18, sans effet rétroactif — RM-2.4.9).
// Quatre des six postes divergeaient du wiki (robinetterie 10 au lieu de 15,
// électroménager 5 au lieu de 8, parquet 10 au lieu de 25) et « Moquette /
// sol souple » FUSIONNAIT deux postes distincts à 7 ans : la durée
// réglementaire d'un lino (10 ans) était inatteignable depuis la liste
// (relevé du 11/09). Trois postes manquaient.
const BAREME: { poste: string; ans: number }[] = [
  { poste: "Peinture / papier peint", ans: 7 },
  { poste: "Moquette", ans: 7 },
  { poste: "Revêtement de sol souple (lino, vinyle)", ans: 10 },
  { poste: "Parquet (hors ponçage)", ans: 25 },
  { poste: "Robinetterie", ans: 15 },
  { poste: "Appareils sanitaires", ans: 25 },
  { poste: "Électroménager (meublé)", ans: 8 },
  { poste: "Volets / stores", ans: 15 },
  { poste: "Serrurerie", ans: 20 },
  { poste: "Chaudière individuelle", ans: 15 },
];

// Un écart du comparatif d'état des lieux, tel que `comparatif_edl` le rend.
// La RPC ne porte NI le commentaire de sortie NI la nature des travaux : le
// report ne peut donc poser qu'un emplacement — « Séjour · Murs ». L'objet de
// la retenue reste à écrire.
export type EcartEdl = { piece: string | null; libelle: string };
const emplacement = (e: EcartEdl) => (e.piece ? `${e.piece} · ${e.libelle}` : e.libelle);

// Miroir du calcul d'`ajouter_retenue` (20260909190000:335-342) : sans durée de
// vie ou sans âge, le coût est retenu en entier ; élément amorti, la base
// REFUSE (RM-2.4.5). Le calcul client est en flottant là où la base calcule en
// `numeric` : c'est un APERÇU, le montant retenu au locataire est celui que la
// base arrête — l'interface ne dit jamais autre chose.
// Seul l'ORDRE diffère : la base refuse d'abord un coût invalide, ici
// l'amortissement se dit dès que l'âge et la durée sont saisis. Le refus ne
// dépend pas du coût, autant le dire tout de suite.
function apercuRetenue(
  cout: number,
  dureeVie: number | null,
  age: number | null
): { montant: number | null; amorti: boolean } {
  if (dureeVie != null && dureeVie > 0 && age != null && age >= dureeVie) {
    return { montant: null, amorti: true };
  }
  if (!Number.isFinite(cout) || cout <= 0) return { montant: null, amorti: false };
  if (dureeVie == null || dureeVie <= 0 || age == null) {
    return { montant: Math.round(cout * 100) / 100, amorti: false };
  }
  return { montant: Math.round(cout * ((dureeVie - age) / dureeVie) * 100) / 100, amorti: false };
}

const nombreOuNull = (brut: string): number | null => {
  const t = brut.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function FormulaireRestitution({
  orgId,
  bailId,
  restitution,
  retenues,
  montantsReels,
  ecarts,
  comparatifDisponible,
}: {
  orgId: string;
  bailId: string;
  restitution: Restitution | null;
  retenues: Retenue[];
  montantsReels: MontantsReels | null;
  // Les écarts du comparatif d'état des lieux, déjà calculés par la page.
  ecarts: EcartEdl[];
  // Le comparatif existe-t-il ? « Aucun écart » et « pas encore de sortie
  // signée » ne se disent pas de la même façon devant une case qui engage
  // un délai légal.
  comparatifDisponible: boolean;
}) {
  if (!restitution)
    return (
      <FormDemarrer
        orgId={orgId}
        bailId={bailId}
        nbEcarts={ecarts.length}
        comparatifDisponible={comparatifDisponible}
      />
    );

  const totalRetenues = retenues.reduce((s, r) => s + Number(r.montant_retenu), 0);
  const soldeProjete = Number(restitution.depot) - Number(restitution.impayes) - totalRetenues;
  const finalise = restitution.statut === "finalise";
  // Le décompte travaille sur l'instantané, jamais sur la réalité du moment :
  // si le locataire règle son arriéré entre le démarrage et la finalisation, on
  // lui imputerait une dette soldée. On ne corrige pas dans son dos — on montre
  // l'écart, le gérant décide.
  const ecartMontants =
    montantsReels != null &&
    (Number(montantsReels.impayes) !== Number(restitution.impayes) ||
      Number(montantsReels.depot) !== Number(restitution.depot));

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          {/* Le total réellement reçu, pas le montant prévu au bail */}
          <dt className="text-xs text-muted-foreground">Dépôt encaissé</dt>
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

      {/* Un chiffre figé qu'on ne sait pas figé est un piège : la date d'arrêté
          se dit, toujours — y compris sur un décompte déjà finalisé. */}
      <p className="mono-discret">
        Dépôt et impayés arrêtés le {formaterDateHeure(restitution.montants_arretes_le)}
        {finalise ? "." : " — ils ne suivent pas la réalité tant qu'ils ne sont pas réarrêtés."}
      </p>

      {ecartMontants && montantsReels && !finalise && (
        <div className="space-y-2 border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          <p>
            Les comptes ont bougé depuis cet arrêté : aujourd&apos;hui{" "}
            <span className="font-medium">{eur(montantsReels.impayes)}</span> d&apos;impayés
            {Number(montantsReels.depot) !== Number(restitution.depot) && (
              <> et <span className="font-medium">{eur(montantsReels.depot)}</span> de dépôt encaissé</>
            )}
            . Le décompte, lui, retient toujours les montants ci-dessus.
          </p>
          <FormRafraichirMontants
            orgId={orgId}
            bailId={bailId}
            restitutionId={restitution.id}
          />
        </div>
      )}

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
        <FormRetenue
          orgId={orgId}
          bailId={bailId}
          restitutionId={restitution.id}
          nbRetenues={retenues.length}
          ecarts={ecarts}
        />
      )}

      {finalise ? (
        <div className="space-y-2">
          <p className="text-sm text-success-soft-foreground">
            Décompte finalisé{restitution.date_emission ? ` le ${formaterDate(restitution.date_emission)}` : ""}.
            Solde de tout compte :{" "}
            <span className="font-semibold">{eur(restitution.solde ?? 0)}</span>.
          </p>
          {/* Le décompte PDF (art. 22 loi 89) : à générer puis envoyer au locataire */}
          <BoutonGenererDocument
            orgId={orgId}
            code="decompte_restitution"
            cibleId={bailId}
            cheminRetour={`/agence/${orgId}/baux/${bailId}`}
            libelle="Générer le décompte PDF"
          />
          {restitution.envoye_le ? (
            <p className="text-sm text-success-soft-foreground">
              Décompte envoyé au locataire le {formaterDate(restitution.envoye_le)}.
            </p>
          ) : (
            <FormDecompteEnvoye
              orgId={orgId}
              bailId={bailId}
              restitutionId={restitution.id}
              avecRetenues={retenues.length > 0}
            />
          )}
        </div>
      ) : (
        <BoutonFinaliser
          orgId={orgId}
          bailId={bailId}
          restitutionId={restitution.id}
          solde={soldeProjete}
          impayes={Number(restitution.impayes)}
          arretesLe={restitution.montants_arretes_le}
          nbRetenues={retenues.length}
          ecartMontants={ecartMontants}
        />
      )}
    </div>
  );
}

function FormDemarrer({
  orgId,
  bailId,
  nbEcarts,
  comparatifDisponible,
}: {
  orgId: string;
  bailId: string;
  nbEcarts: number;
  comparatifDisponible: boolean;
}) {
  const [etat, action] = useActionState<EtatRestit, FormData>(
    demarrerRestitution.bind(null, orgId, bailId),
    {}
  );
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Le délai de restitution court à compter de la remise des clés : 1 mois si
        l&apos;état des lieux de sortie est conforme à l&apos;entrée, 2 mois sinon.
      </p>
      {/* Ce que le comparatif a relevé, DIT AVANT la case — la carte qui le
          détaille vivait sous le formulaire qui la consomme (relevé du 11/09).
          On affiche, on ne coche pas : un délai d'un mois choisi par défaut
          alors que deux s'imposent est une exposition directe (majoration de
          retard, RM-2.4.10). `demarrer_restitution` accepte p_conforme sans
          jamais le vérifier : le délai reste une décision de l'agent. */}
      <p className="text-sm">
        {!comparatifDisponible
          ? "L’état des lieux de sortie n’est pas encore signé : aucun comparatif ne peut confirmer la conformité."
          : nbEcarts === 0
            ? "Le comparatif d’état des lieux ne relève aucun écart entre l’entrée et la sortie."
            : `Le comparatif d’état des lieux relève ${nbEcarts} écart${nbEcarts > 1 ? "s" : ""} entre l’entrée et la sortie — le délai est alors de 2 mois (RM-2.4.2).`}
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
        <BoutonEnvoi size="sm">
          Démarrer la restitution
        </BoutonEnvoi>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

function FormRetenue({
  orgId,
  bailId,
  restitutionId,
  nbRetenues,
  ecarts,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
  nbRetenues: number;
  ecarts: EcartEdl[];
}) {
  const [etat, action] = useActionState<EtatRestit, FormData>(
    ajouterRetenue.bind(null, orgId, bailId, restitutionId),
    {}
  );
  return (
    <form action={action} className="space-y-2 border border-dashed border-border p-3">
      <p className="text-sm font-medium">Ajouter une retenue (décote de vétusté)</p>
      {/* La clé remonte les CHAMPS — pas le formulaire — dès qu'une retenue est
          enregistrée : React remet alors les champs non contrôlés à leur
          défaut, l'aperçu de décote doit repartir avec eux. L'état de l'action
          (erreur, succès, avertissement) vit au-dessus et survit au remontage. */}
      <ChampsRetenue key={`retenue-${nbRetenues}`} valeurs={etat.valeurs} ecarts={ecarts} />
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {/* L'action rend un avertissement AVEC son succès (« ce fichier est en
          réalité un PDF malgré son extension ») : il était jeté, seul l'échec
          s'affichait (relevé du 11/09). */}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

// Les champs de la retenue et l'aperçu de sa décote. Champs laissés NON
// contrôlés — c'est ce qui fait marcher la repose de etat.valeurs (React remet
// le formulaire à ses valeurs par défaut après l'action) ; l'aperçu se nourrit
// donc d'une copie tenue à jour à la frappe.
function ChampsRetenue({
  valeurs,
  ecarts,
}: {
  valeurs?: Record<string, string>;
  ecarts: EcartEdl[];
}) {
  const idLibelle = useId();
  const idJustificatif = useId();
  const champLibelle = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState({
    cout: valeurs?.cout ?? "",
    duree_vie: valeurs?.duree_vie ?? "",
    age: valeurs?.age ?? "",
  });
  // L'événement `input` remonte : un seul écouteur pour les trois champs.
  const relire = (e: React.FormEvent<HTMLDivElement>) => {
    const champ = e.target as HTMLInputElement;
    const nom = champ?.name;
    if (nom !== "cout" && nom !== "duree_vie" && nom !== "age") return;
    setSaisie((p) => ({ ...p, [nom]: champ.value }));
  };

  const cout = Number(saisie.cout.trim());
  const dureeVie = nombreOuNull(saisie.duree_vie);
  const age = nombreOuNull(saisie.age);
  const { montant: apercu, amorti } = apercuRetenue(cout, dureeVie, age);

  // Le report ne crée RIEN et ne décide RIEN : il pose l'emplacement dans
  // l'objet, curseur en fin de champ, pour que l'agent écrive la nature des
  // travaux derrière. L'imputabilité, le coût, la vétusté et le justificatif
  // restent entiers — « le module 1 constate, il ne juge pas » (RM-1.13.3) ;
  // l'imputabilité se juge ici, à la main (parcours 2.4, étape 3).
  const reporter = (texte: string) => {
    const champ = champLibelle.current;
    if (!champ) return;
    champ.value = texte;
    champ.focus();
    champ.setSelectionRange(texte.length, texte.length);
  };

  return (
    <div className="space-y-2" onInput={relire}>
      {ecarts.length > 0 && (
        // Sans ce report, l'agent descendait lire « Séjour · Murs » dans le
        // comparatif, remontait, et le retapait de mémoire dans l'objet : un
        // aller-retour de défilement et une saisie par écart (relevé 11/09).
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Préparer une retenue depuis un écart du comparatif — le bouton reporte
            l&apos;emplacement dans l&apos;objet ci-dessous ; la nature des travaux
            reste à écrire.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ecarts.map((e, i) => (
              <Button
                key={`${emplacement(e)}-${i}`}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => reporter(emplacement(e))}
              >
                {emplacement(e)}
              </Button>
            ))}
          </div>
        </div>
      )}
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={idLibelle} className="text-xs">Objet de la retenue</Label>
          <Input ref={champLibelle} id={idLibelle} name="libelle" placeholder="Ex. remise en peinture séjour" defaultValue={valeurs?.libelle} className="h-9 w-56" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ret-cout" className="text-xs">Coût (€)</Label>
          <Input id="ret-cout" name="cout" type="number" step="0.01" min="0.01" defaultValue={valeurs?.cout} className="h-9 w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ret-duree" className="text-xs">Durée de vie (ans)</Label>
          <Input id="ret-duree" name="duree_vie" type="number" step="1" min="1" list="bareme-vetuste" defaultValue={valeurs?.duree_vie} className="h-9 w-28" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ret-age" className="text-xs">Âge (ans)</Label>
          <Input id="ret-age" name="age" type="number" step="1" min="0" defaultValue={valeurs?.age} className="h-9 w-20" />
        </div>
      </div>
      <datalist id="bareme-vetuste">
        {BAREME.map((b) => (
          <option key={b.poste} value={b.ans}>{b.poste}</option>
        ))}
      </datalist>

      {/* Le refus doit se lire AVANT le geste : la base refuse l'élément amorti
          (RM-2.4.5) et refusait jusqu'ici au RETOUR de l'envoi — le justificatif
          était déjà monté au Storage, puis purgé. Le montant, lui, n'apparaissait
          nulle part avant l'enregistrement : la formule était écrite, le nombre
          jamais (relevé du 11/09). */}
      {amorti && dureeVie != null && age != null && (
        <p className="border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Élément entièrement amorti ({age} ans sur {dureeVie} ans) : aucune retenue
          possible (RM-2.4.5). Corrigez l&apos;âge ou la durée de vie.
        </p>
      )}
      {!amorti && apercu != null && (
        <p className="text-sm">
          Aperçu de la retenue : <span className="font-semibold">{eur(apercu)}</span>
          {dureeVie != null && age != null
            ? ` — vétusté ${age}/${dureeVie} ans déduite.`
            : " — coût intégral, aucune vétusté déduite."}{" "}
          <span className="text-muted-foreground">
            Le montant retenu au locataire est celui que la base arrête à
            l&apos;enregistrement.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Champ et bouton sur la même ligne : le libellé ne s'adresse qu'à la
            synthèse vocale, pour ne pas décaler le bouton. */}
        <Label htmlFor={idJustificatif} className="sr-only">
          Justificatif de la retenue
        </Label>
        <Input id={idJustificatif} name="justificatif" type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-9 w-64 text-xs" />
        <BoutonEnvoi size="sm" variant="outline" disabled={amorti}>
          Ajouter la retenue
        </BoutonEnvoi>
      </div>
      <p className="text-xs text-muted-foreground">
        Retenue = coût × (durée de vie − âge) / durée de vie. Laisser durée de vie
        vide pour retenir le coût intégral (dégradation, non-vétusté).
      </p>
    </div>
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
  const [etat, action] = useActionState<EtatRestit, FormData>(
    async () => supprimerRetenue(orgId, bailId, retenueId),
    {}
  );
  return (
    <form action={action}>
      <BoutonEnvoi size="sm" variant="ghost" className="text-xs text-destructive">
        Retirer
      </BoutonEnvoi>
      {etat.erreur && <span className="block text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

// Réarrêter le dépôt et les impayés sur la réalité du jour. Geste explicite du
// gérant : à quelle date les impayés doivent être arrêtés n'est tranché par
// aucune règle, l'application ne le décide donc pas toute seule.
function FormRafraichirMontants({
  orgId,
  bailId,
  restitutionId,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
}) {
  const [etat, action] = useActionState<EtatRestit, FormData>(
    async () => rafraichirMontantsRestitution(orgId, bailId, restitutionId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Mise à jour…">
        Réarrêter les montants à aujourd&apos;hui
      </BoutonEnvoi>
      {etat.erreur && <span className="w-full text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="w-full text-sm">{etat.succes}</span>}
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
  const [etat, action] = useActionState<EtatRestit, FormData>(
    justifierRetenue.bind(null, orgId, bailId, retenue.id),
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
      <BoutonEnvoi size="sm" variant="outline">
        Joindre le devis / la facture
      </BoutonEnvoi>
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
  avecRetenues,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
  avecRetenues: boolean;
}) {
  const [etat, action] = useActionState<EtatRestit, FormData>(
    marquerDecompteEnvoye.bind(null, orgId, bailId, restitutionId),
    {}
  );
  return (
    <>
      {/* Le canal dépend des retenues et se décidait hors de l'écran : décision
          du 25/07 (wiki/processus/Restitution du dépôt de garantie.md, « Canal
          du décompte — tranché »). Dit ici, à l'instant où l'on déclare
          l'envoi, plutôt que nulle part. */}
      {avecRetenues && (
        <p className="mb-2 border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Décompte AVEC retenues : il part en lettre recommandée avec accusé de
          réception, hors plateforme. Déposez le justificatif LRAR en GED,
          rattaché au bail, avec sa date de première présentation — l&apos;email et
          l&apos;espace locataire restent en parallèle pour la consultation.
        </p>
      )}
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="decompte-envoye-date" className="text-xs">
          Envoyé au locataire le
        </Label>
        <InputDateJour id="decompte-envoye-date" name="date" required />
      </div>
      <BoutonEnvoi size="sm" variant="outline">
        Décompte envoyé
      </BoutonEnvoi>
      {etat.erreur && <span className="w-full text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="w-full text-sm text-success-soft-foreground">{etat.succes}</span>}
    </form>
    </>
  );
}

// Finaliser FIGE le décompte : plus aucune retenue ne s'ajoute ni ne se retire,
// et toute correction ultérieure passe par un décompte rectificatif (RM-2.7.3).
// Un geste irréversible se confirme — même patron que la signature d'un EDL de
// sortie ou la suppression d'une détention : le bouton ouvre une modale qui
// annonce ce qui va être figé, puis déclenche l'envoi réel.
function BoutonFinaliser({
  orgId,
  bailId,
  restitutionId,
  solde,
  impayes,
  arretesLe,
  nbRetenues,
  ecartMontants,
}: {
  orgId: string;
  bailId: string;
  restitutionId: string;
  solde: number;
  impayes: number;
  arretesLe: string;
  nbRetenues: number;
  ecartMontants: boolean;
}) {
  const [etat, action] = useActionState<EtatRestit, FormData>(
    async () => finaliserDecompte(orgId, bailId, restitutionId),
    {}
  );
  const [confirme, setConfirme] = useState(false);
  const boutonEnvoyer = useRef<HTMLButtonElement>(null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={() => setConfirme(true)}>
        Finaliser le décompte
      </Button>
      <button type="submit" ref={boutonEnvoyer} hidden />
      <span className="text-xs text-muted-foreground">
        Fige le solde de tout compte et crée l&apos;alerte d&apos;envoi.
      </span>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-sm text-success-soft-foreground">{etat.succes}</span>}

      {confirme && (
        <Modale
          titre="Finaliser le décompte de restitution"
          surtitre="Solde de tout compte"
          fermer={() => setConfirme(false)}
          pied={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirme(false)}>
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setConfirme(false);
                  boutonEnvoyer.current?.click();
                }}
              >
                Finaliser
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            Solde arrêté :{" "}
            <span className="font-semibold">{eur(solde)}</span>{" "}
            {solde < 0 ? "de créance sur le locataire" : "à restituer au locataire"}, après
            imputation de {eur(impayes)} d&apos;impayés arrêtés le{" "}
            {formaterDateHeure(arretesLe)}
            {nbRetenues > 0
              ? `, et ${nbRetenues} retenue${nbRetenues > 1 ? "s" : ""} pour dégradation.`
              : ", sans aucune retenue pour dégradation."}
          </p>
          {ecartMontants && (
            <p className="border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              Les comptes du bail ont bougé depuis cet arrêté. Fermez cette fenêtre
              pour réarrêter les montants d&apos;abord si le décompte doit en tenir
              compte.
            </p>
          )}
          <p className="text-sm">
            Une fois finalisé, le décompte est figé : aucune retenue ne peut plus
            être ajoutée ni retirée, et toute correction passera par un décompte
            rectificatif envoyé au locataire.
          </p>
        </Modale>
      )}
    </form>
  );
}
