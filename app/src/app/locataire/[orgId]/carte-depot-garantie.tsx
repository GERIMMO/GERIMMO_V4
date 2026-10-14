import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { eur, formaterDate } from "@/lib/ged";

// Ligne du RPC ma_restitution_locataire : le suivi de la restitution du dépôt de
// garantie du locataire sortant. Avant le décompte (« en_cours »), seuls le
// dépôt, la remise des clés et le délai se lisent ; le solde n'est rendu qu'une
// fois le décompte établi (« finalise »).
export type RestitutionLocataire = {
  statut: string;
  date_remise_cles: string;
  delai_mois: number;
  depot: number;
  impayes: number | null;
  solde: number | null;
  date_emission: string | null;
  sans_edl_entree: boolean | null;
  trop_percu?: number | null;
};

/** Ancre de la carte « Votre dépôt de garantie » de la page Mes paiements. */
export const ANCRE_DEPOT_GARANTIE = "depot-garantie";

/**
 * La carte « Votre dépôt de garantie » de l'accueil (décision D36, option B).
 *
 * Elle prend la place de « Rien à régler pour l'instant » quand une restitution
 * existe — en cours ou décompte établi : un locataire sorti dont le décompte
 * établit une créance ne doit pas lire que tout est réglé. Elle ne calcule rien :
 * les montants sont ceux que la base rend (ma_restitution_locataire), le détail
 * des retenues reste sur la page « Mes paiements », vers laquelle elle renvoie.
 */
export function CarteDepotGarantie({
  orgId,
  restitution,
  classeCarte,
  classeLien,
}: {
  orgId: string;
  restitution: RestitutionLocataire;
  /** Classes de la carte-indicateur de l'accueil (voir page.tsx) */
  classeCarte: string;
  /** Classes du lien qui s'étire sur toute la carte */
  classeLien: string;
}) {
  const etabli = restitution.statut === "finalise";
  const solde = Number(restitution.solde ?? 0);
  const restantDu = etabli && solde < 0;
  return (
    <div className={`${classeCarte} carte-rubrique`} data-ton="bleu">
      <p className="titre-rubrique text-sm font-semibold">
        <ShieldCheck size={20} aria-hidden="true" />
        Votre dépôt de garantie
      </p>
      {etabli ? (
        <>
          <p className="v montant">{eur(Math.abs(solde))}</p>
          <p className="text-xs text-muted-foreground">
            {restantDu
              ? "restant dû, solde de votre décompte"
              : "à vous restituer, solde de votre décompte"}
          </p>
          <span className={`loc-tag mt-2.5 ${restantDu ? "ambre" : "vert"}`}>
            Décompte établi
            {restitution.date_emission ? ` le ${formaterDate(restitution.date_emission)}` : ""}
          </span>
        </>
      ) : (
        <>
          <p className="v montant">{eur(Number(restitution.depot))}</p>
          <p className="text-xs text-muted-foreground">
            dépôt versé · restitution sous {restitution.delai_mois} mois à compter de la remise
            des clés ({formaterDate(restitution.date_remise_cles)}), décompte détaillé à suivre
          </p>
          <span className="loc-tag bleu mt-2.5">Restitution en cours</span>
        </>
      )}
      <Link
        href={`/locataire/${orgId}/loyers#${ANCRE_DEPOT_GARANTIE}`}
        className={`${classeLien} mt-3 block`}
      >
        {etabli ? "Voir le décompte" : "Suivre ma restitution"}
        {" "}→
      </Link>
    </div>
  );
}
