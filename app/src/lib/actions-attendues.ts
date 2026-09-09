import type { SupabaseClient } from "@supabase/supabase-js";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { aujourdhuiParis, estExpiree, eur, formaterDate } from "@/lib/ged";
import { diagnosticsExigibles, obligatoireEnDefaut } from "@/lib/diagnostics";

// Actions attendues sur les baux en cours — LA source commune (audit 09/09,
// P2). L'accueil du propriétaire disait « tout est en ordre » pendant que la
// fiche du bail listait un impayé, un état des lieux d'entrée non signé et
// des diagnostics manquants : chaque écran calculait dans son coin. Ce module
// produit les mêmes items partout — fiche bail, accueil propriétaire,
// tableau de bord — chacun menant à l'écran qui résout l'action :
//   - loyers impayés (appels échus non couverts par les encaissements,
//     imputés du plus ancien au plus récent comme etat_loyers_bail) ;
//   - état des lieux d'entrée non signé sur un bail en cours ;
//   - diagnostics obligatoires absents ou expirés (DPE au lot en habitation,
//     ERP au bien — même critère que lot_blocages_location côté SQL) ;
//   - pièces de la GED expirées (documents_a_renouveler).
// Calcul à la volée, sans nouvelle table ni tâche asynchrone.

export type ActionAttendue = {
  cle: string;
  titre: string;
  detail: string | null;
  href: string;
  critique: boolean;
};

type BailEnCours = {
  id: string;
  etat: string;
  lot_id: string;
  lot: UnOuPlusieurs<{
    id: string;
    nom: string;
    bien_id: string;
    bien: UnOuPlusieurs<{
      id: string;
      nom: string;
      type: string;
      annee_construction: number | null;
    }>;
  }>;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

export async function actionsAttendues(
  supabase: SupabaseClient,
  orgId: string,
  options: { bailId?: string; portefeuille?: Set<string> | null } = {}
): Promise<ActionAttendue[]> {
  const aujourdhui = aujourdhuiParis();
  const { bailId, portefeuille } = options;

  let requeteBaux = supabase
    .from("baux")
    .select(
      "id, etat, lot_id, lot:lots(id, nom, bien_id, bien:biens!lots_bien_id_fkey(id, nom, type, annee_construction))"
    )
    .eq("organization_id", orgId)
    .in("etat", ["actif", "preavis"]);
  if (bailId) requeteBaux = requeteBaux.eq("id", bailId);
  const { data: bauxBruts } = await requeteBaux;

  const baux = ((bauxBruts ?? []) as unknown as BailEnCours[]).filter(
    (b) => !portefeuille || portefeuille.has(b.lot_id)
  );
  const bailIds = baux.map((b) => b.id);

  const vide = { data: [] as never[] };
  const [
    { data: edlsSignes },
    { data: appels },
    { data: encaissements },
    { data: diagnostics },
    { data: piecesARenouveler },
  ] = await Promise.all([
    bailIds.length
      ? supabase
          .from("etats_des_lieux")
          .select("bail_id")
          .eq("organization_id", orgId)
          .eq("type", "entree")
          .eq("etat", "signe")
          .in("bail_id", bailIds)
      : Promise.resolve(vide),
    bailIds.length
      ? supabase
          .from("appels_loyer")
          .select("bail_id, montant_du, date_echeance")
          .eq("organization_id", orgId)
          .in("bail_id", bailIds)
      : Promise.resolve(vide),
    bailIds.length
      ? supabase
          .from("encaissements")
          .select("bail_id, montant")
          .eq("organization_id", orgId)
          .in("bail_id", bailIds)
      : Promise.resolve(vide),
    bailIds.length
      ? supabase
          .from("diagnostics")
          .select("type, lot_id, bien_id, date_expiration")
          .eq("organization_id", orgId)
          .in("type", ["dpe", "erp"])
          .is("archived_at", null)
      : Promise.resolve(vide),
    // Les pièces expirées sont une affaire d'organisation, pas d'un bail :
    // hors sujet quand on ne regarde qu'un bail.
    bailId
      ? Promise.resolve(vide)
      : supabase.rpc("documents_a_renouveler", {
          p_org: orgId,
          p_limite: aujourdhui,
          p_lots: portefeuille ? [...portefeuille] : null,
        }),
  ]);

  const bailsAvecEdl = new Set(
    ((edlsSignes ?? []) as { bail_id: string }[]).map((e) => e.bail_id)
  );
  const encaisseParBail = new Map<string, number>();
  for (const e of (encaissements ?? []) as { bail_id: string; montant: number }[]) {
    encaisseParBail.set(e.bail_id, (encaisseParBail.get(e.bail_id) ?? 0) + Number(e.montant));
  }
  const appelsParBail = new Map<string, { montant_du: number; date_echeance: string }[]>();
  for (const a of (appels ?? []) as {
    bail_id: string;
    montant_du: number;
    date_echeance: string;
  }[]) {
    const liste = appelsParBail.get(a.bail_id) ?? [];
    liste.push(a);
    appelsParBail.set(a.bail_id, liste);
  }
  const lignesDiagnostics = (diagnostics ?? []) as {
    type: string;
    lot_id: string | null;
    bien_id: string | null;
    date_expiration: string | null;
  }[];

  const impayes: ActionAttendue[] = [];
  const edls: ActionAttendue[] = [];
  const diags: ActionAttendue[] = [];
  const biensSignales = new Set<string>();

  for (const bail of baux) {
    const lot = premier(bail.lot);
    const bien = premier(lot?.bien ?? null);
    const nomLot = lot?.nom ?? "Lot";

    // Impayés : les appels échus, couverts du plus ancien au plus récent par
    // le total encaissé — même imputation qu'etat_loyers_bail (SQL).
    const duEchu = (appelsParBail.get(bail.id) ?? [])
      .filter((a) => a.date_echeance < aujourdhui)
      .reduce((s, a) => s + Number(a.montant_du), 0);
    const reste = arrondi(duEchu - (encaisseParBail.get(bail.id) ?? 0));
    if (reste > 0) {
      impayes.push({
        cle: `impaye-${bail.id}`,
        titre: `Loyer impayé — ${nomLot}`,
        detail: `${eur(reste)} échus non couverts`,
        href: `/agence/${orgId}/baux/${bail.id}#loyers`,
        critique: true,
      });
    }

    // État des lieux d'entrée : sans lui, aucune retenue possible à la sortie
    if (!bailsAvecEdl.has(bail.id)) {
      edls.push({
        cle: `edl-${bail.id}`,
        titre: `État des lieux d'entrée à signer — ${nomLot}`,
        detail: "Sans lui, aucune retenue ne sera possible à la sortie",
        href: `/agence/${orgId}/baux/${bail.id}#edl`,
        critique: false,
      });
    }

    // Diagnostics obligatoires : DPE au lot (habitation), ERP au bien —
    // absents OU expirés, comme le contrôle bloquant de la base.
    if (lot && bien) {
      const exigiblesLot = diagnosticsExigibles(bien, "lot");
      const deposesLot = lignesDiagnostics.filter((d) => d.lot_id === lot.id);
      if (
        exigiblesLot.some((e) => e.type === "dpe") &&
        obligatoireEnDefaut("dpe", deposesLot)
      ) {
        diags.push({
          cle: `dpe-${lot.id}`,
          titre: `DPE absent ou expiré — ${nomLot}`,
          detail: "Obligatoire en habitation (au lot)",
          href: `/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}#diagnostics`,
          critique: false,
        });
      }
      if (!biensSignales.has(bien.id)) {
        const deposesBien = lignesDiagnostics.filter((d) => d.bien_id === bien.id);
        if (obligatoireEnDefaut("erp", deposesBien)) {
          biensSignales.add(bien.id);
          diags.push({
            cle: `erp-${bien.id}`,
            titre: `ERP absent ou expiré — ${bien.nom}`,
            detail: "État des risques, validité 6 mois (à l'immeuble)",
            href: `/agence/${orgId}/parc/${bien.id}#diagnostics`,
            critique: false,
          });
        }
      }
    }
  }

  // Pièces de la GED expirées (le RPC rend « à renouveler sous 30 j » quand on
  // lui passe une limite future ; ici la limite est aujourd'hui, on ne garde
  // que le strictement expiré).
  const pieces: ActionAttendue[] = (
    (piecesARenouveler ?? []) as { id: string; titre: string; expire_le: string }[]
  )
    .filter((p) => estExpiree(p.expire_le))
    .map((p) => ({
      cle: `piece-${p.id}`,
      titre: `Pièce expirée — ${p.titre}`,
      detail: `expirée le ${formaterDate(p.expire_le)}`,
      href: `/agence/${orgId}/documents?sel=${p.id}`,
      critique: false,
    }));

  // Les impayés d'abord (argent en jeu), puis ce qui fragilise le bail, puis
  // la conformité et l'intendance documentaire.
  return [...impayes, ...edls, ...diags, ...pieces];
}

// Une alerte ouverte peut porter la même nouvelle qu'un item calculé (l'alerte
// « edl_entree » posée à l'activation du bail) : on ne l'affiche pas deux fois.
export function sansAlertesDoublonnees<
  T extends { type: string; details: Record<string, unknown> | null }
>(alertes: T[], actions: ActionAttendue[]): T[] {
  const cles = new Set(actions.map((a) => a.cle));
  return alertes.filter(
    (a) =>
      !(
        a.type === "edl_entree" &&
        typeof a.details?.bail_id === "string" &&
        cles.has(`edl-${a.details.bail_id}`)
      )
  );
}
