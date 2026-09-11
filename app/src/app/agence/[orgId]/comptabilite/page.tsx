import { verifierAccesEspace } from "@/lib/espace";
import { eur, formaterDate, moisEnFrancais, aujourdhuiParis } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FormulaireEcriture,
  FormulaireVentilation,
  FormulaireCloture,
  BoutonContre,
  RapportsGestion,
  type MandatCompta,
  type RapportCompta,
} from "./formulaire-compta";
import { QuittancementMois, type LigneQuittancement } from "./quittancement-mois";
import { lotsDuPortefeuille } from "@/lib/portefeuille";

export const metadata = { title: "Comptabilité — Gerimmo" };

// Le journal affiché est paginé ; les totaux, eux, se calculent en base sur
// TOUT le journal. L'écran doit dire lequel des deux il montre.
const LIGNES_JOURNAL = 200;

type Ecriture = {
  id: string;
  categorie: string;
  sens: string;
  montant: number;
  date_piece: string;
  date_imputation: string;
  libelle: string | null;
  systeme: boolean;
  contre_ecriture_de: string | null;
  lot_id: string | null;
};

export default async function PageComptabilite(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;
  const { supabase, user, role, estProprietaire } = await verifierAccesEspace(orgId);
  // « Mon portefeuille » (maquette v3, RM-18.1.3) : l'agent lit sa
  // comptabilité à travers ses mandats — null : il voit tout.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  const dansPortefeuille = (lotId: string | null | undefined) =>
    !portefeuille || (lotId != null && portefeuille.has(lotId));

  const [
    { data: ecritures, error: erreurEcritures },
    { data: clotures, error: erreurClotures },
    { data: biens, error: erreurBiens },
    { data: lots, error: erreurLots },
    { data: mandatsRaw, error: erreurMandats },
    { data: rapports, error: erreurRapports },
    { data: totaux, error: erreurTotaux },
  ] = await Promise.all([
    supabase
      .from("ecritures")
      .select("id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme, contre_ecriture_de, lot_id")
      .eq("organization_id", orgId)
      .order("date_imputation", { ascending: false })
      .limit(LIGNES_JOURNAL),
    supabase.from("clotures_comptables").select("mois").eq("organization_id", orgId).order("mois", { ascending: false }),
    supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("nom"),
    supabase
      .from("lots")
      .select("id, nom, bien:biens!lots_bien_id_fkey(nom)")
      .eq("organization_id", orgId)
      .order("nom"),
    // Préavis et résilié restent listés : leurs rapports envoyés attendent
    // parfois encore leur versement.
    supabase
      .from("mandats")
      .select("id, etat, agent_account_id, mandant:persons(nom, prenom)")
      .eq("organization_id", orgId)
      .in("etat", ["actif", "preavis", "resilie"]),
    supabase
      .from("rapports_gestion")
      .select("id, mandat_id, mois, statut, net, versement_montant")
      .eq("organization_id", orgId)
      .order("mois", { ascending: false }),
    // Les totaux se calculent en base sur tout le journal (hors dépôt de
    // garantie et paires contre-passées) — le journal affiché, lui, reste
    // paginé à LIGNES_JOURNAL lignes.
    supabase.rpc("totaux_ecritures", {
      p_org: orgId,
      p_lots: portefeuille ? Array.from(portefeuille) : null,
    }),
  ]);

  // Un échec de lecture ne doit pas se déguiser en journal vide (audit 09/09).
  // Ici, aucune des sept lectures n'est décorative : sans les totaux, les
  // tuiles afficheraient 0 € ; sans les clôtures, un mois figé se laisserait
  // annuler ; sans les lots, une écriture se saisirait hors de tout rapport de
  // gestion. On nomme ce qui a échoué plutôt que de montrer un livre neuf.
  const lecturesEnEchec = [
    erreurEcritures && "le journal des écritures",
    erreurTotaux && "les totaux du livre",
    erreurClotures && "les mois déjà clôturés",
    erreurLots && "la liste des lots",
    erreurBiens && "la liste des biens",
    erreurMandats && "les mandats de gestion",
    erreurRapports && "les rapports de gestion",
  ].filter((x): x is string => Boolean(x));

  if (lecturesEnEchec.length > 0) {
    return (
      <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
        <div className="entete-page mb-4">
          <h1>Comptabilité</h1>
        </div>
        <div className="err" role="alert">
          <p className="font-medium">
            {lecturesEnEchec.length > 1
              ? "Plusieurs lectures ont échoué"
              : "Une lecture a échoué"}{" "}
            : {lecturesEnEchec.join(", ")}.
          </p>
          <p className="mt-1">
            Ce n’est pas un livre vide : c’est la lecture qui n’a pas abouti. Les
            montants ne sont donc pas affichés — un total calculé sur une lecture
            incomplète serait faux. Rechargez la page dans un instant, et ne
            saisissez rien sur la foi de cet écran.
          </p>
        </div>
      </main>
    );
  }

  // Portefeuille : seules les écritures rattachées à un de mes lots comptent
  // (une écriture sans lot reste une affaire d'agence).
  const toutesLesLignes = (ecritures ?? []) as Ecriture[];
  const lignes = toutesLesLignes.filter((e) => dansPortefeuille(e.lot_id));
  // La base a rendu une page pleine : il y a (très probablement) plus ancien
  // derrière. Le dire, sinon le journal passe pour complet.
  const journalTronque = toutesLesLignes.length >= LIGNES_JOURNAL;
  const t = (Array.isArray(totaux) ? totaux[0] : totaux) as
    | { recettes: number | string; depenses: number | string }
    | null;
  const recettes = Number(t?.recettes ?? 0);
  const depenses = Number(t?.depenses ?? 0);
  const moisClotures = new Set(((clotures ?? []) as { mois: string }[]).map((c) => c.mois.slice(0, 7)));
  const moisCourant = aujourdhuiParis().slice(0, 7);
  const anneeCourante = moisCourant.slice(0, 4);
  const mandats: MandatCompta[] = (
    (mandatsRaw ?? []) as {
      id: string;
      etat: string;
      agent_account_id: string | null;
      mandant:
        | { nom: string; prenom: string | null }
        | { nom: string; prenom: string | null }[]
        | null;
    }[]
  )
    // Agent avec portefeuille : uniquement les mandats qui lui sont confiés.
    .filter((m) => !portefeuille || m.agent_account_id === user.id)
    .map((m) => {
      // Jointure to-one : PostgREST renvoie un objet (le typage générait un
      // tableau — le nom du mandant s'affichait « — »). On accepte les deux.
      const p = Array.isArray(m.mandant) ? m.mandant[0] : m.mandant;
      return { id: m.id, etat: m.etat, mandant_nom: p ? nomComplet(p) : "—" };
    });

  // Le lot d'une écriture, choisi par son nom complet (bien — lot) ; un agent
  // ne saisit que dans son portefeuille.
  const lotsEcriture = (
    (lots ?? []) as {
      id: string;
      nom: string;
      bien: { nom: string | null } | { nom: string | null }[] | null;
    }[]
  )
    .filter((l) => dansPortefeuille(l.id))
    .map((l) => {
      const b = Array.isArray(l.bien) ? l.bien[0] : l.bien;
      return { id: l.id, nom: b?.nom ? `${b.nom} — ${l.nom}` : l.nom };
    });

  // Repère de tête : où en est la comptabilité — clôtures triées du plus récent
  const dernierCloture = [...moisClotures][0];

  // Quittancement du mois (maquette v3) : le mois courant, ou à défaut le
  // dernier mois qui porte des appels (en début de mois, les échéanciers ne
  // sont pas toujours régénérés).
  //
  // Le repli sur le mois précédent ne vaut QUE pour un mois vraiment vide : si
  // la lecture échoue, replier afficherait le mois d'avant comme s'il était
  // l'actualité. L'échec se dit, il ne se contourne pas.
  const lireQuittancement = async (mois: string) => {
    const { data, error } = await supabase.rpc("quittancement_mois", {
      p_org: orgId,
      p_mois: `${mois}-01`,
    });
    return {
      lignes: ((data ?? []) as LigneQuittancement[]).filter((l) => dansPortefeuille(l.lot_id)),
      error,
    };
  };
  let moisQuittancement = moisCourant;
  const courant = await lireQuittancement(moisCourant);
  let lignesQuittancement = courant.lignes;
  let erreurQuittancement = courant.error;
  if (!erreurQuittancement && lignesQuittancement.length === 0) {
    const precedent = new Date(`${moisCourant}-01T00:00:00Z`);
    precedent.setUTCMonth(precedent.getUTCMonth() - 1);
    const moisPrecedent = precedent.toISOString().slice(0, 7);
    const veille = await lireQuittancement(moisPrecedent);
    erreurQuittancement = veille.error;
    if (!veille.error && veille.lignes.length > 0) {
      moisQuittancement = moisPrecedent;
      lignesQuittancement = veille.lignes;
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <div className="entete-page mb-6">
          <h1>
            {estProprietaire
              ? "Livre recettes-dépenses"
              : role === "agent"
                ? "Loyers & charges"
                : "Comptabilité"}
          </h1>
          <span className="mono-discret">
            {portefeuille ? "Mon portefeuille · " : ""}
            {dernierCloture ? `${moisEnFrancais(dernierCloture)} clôturé · ` : ""}
            {moisEnFrancais(moisCourant)} ouvert
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {estProprietaire
            ? "Vos encaissements et vos dépenses, sans honoraires. Une écriture ne se modifie pas : on l'annule par une écriture inverse, qui reste visible. Clôturer un mois est recommandé, jamais imposé."
            : "Le journal des encaissements et des dépenses de l'agence. Une écriture ne se modifie pas : on l'annule par une écriture inverse, qui reste visible. Chaque mois se clôture une fois pour toutes."}
        </p>
        {/* S9a : seul le propriétaire direct bénéficie de l'aide fiscale */}
        {estProprietaire && (
          <p className="mt-2 text-sm">
            <a
              href={`/agence/${orgId}/comptabilite/fiscal`}
              className="lien-discret inline-block py-2 sm:py-0"
            >
              Récapitulatif fiscal {anneeCourante} (déclaration 2044) →
            </a>
          </p>
        )}
      </div>

      {/* Solde en tuiles KPI (maquette) — même motif que le tableau de bord.
          Ces trois chiffres portent TOUT le livre depuis son ouverture : lus
          comme le mois en cours, ils faisaient croire à un mois énorme. La
          portée se lit maintenant sous chaque chiffre. */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="kpi bleu">
          <span className="eyebrow">Recettes</span>
          <span className="chiffre montant mt-1 block">{eur(recettes)}</span>
          <span className="block text-xs text-muted-foreground">depuis l&apos;origine</span>
        </div>
        <div className="kpi or">
          <span className="eyebrow">Dépenses</span>
          <span className="chiffre montant mt-1 block">{eur(depenses)}</span>
          <span className="block text-xs text-muted-foreground">depuis l&apos;origine</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Net</span>
          <span className="chiffre montant mt-1 block">{eur(recettes - depenses)}</span>
          <span className="block text-xs text-muted-foreground">recettes moins dépenses</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Totaux de tout le livre depuis son ouverture — hors dépôt de garantie
        (qui ne fait que transiter) et hors écritures annulées par contre-écriture.
        Ils ne se limitent pas au mois en cours, ni aux lignes du journal
        ci-dessous.
      </p>

      {/* Quittancement du mois (maquette v3) : encaisser en un clic, envoi groupé */}
      {erreurQuittancement ? (
        <Card>
          <CardContent className="pt-5">
            <p className="err mb-0" role="alert">
              Impossible de lire le quittancement du mois — ce n’est pas un mois
              sans appels de loyer, c’est une lecture qui a échoué. Les
              encaissements du mois restent accessibles depuis chaque bail.
            </p>
          </CardContent>
        </Card>
      ) : (
        lignesQuittancement.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <QuittancementMois
                orgId={orgId}
                mois={moisQuittancement}
                moisLabel={moisEnFrancais(moisQuittancement)}
                lignes={lignesQuittancement}
                proprietaire={estProprietaire}
              />
            </CardContent>
          </Card>
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle>Saisir une écriture</CardTitle>
          <CardDescription>
            Deux dates : celle de la pièce justificative, et le mois sur lequel
            l&apos;écriture compte.
            {estProprietaire
              ? " Les loyers encaissés s'inscrivent tout seuls."
              : " Les honoraires, eux, se créent tout seuls à chaque encaissement de loyer."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormulaireEcriture orgId={orgId} lots={lotsEcriture} />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">
              Dépense sur tout le bien, répartie entre ses lots
            </p>
            <FormulaireVentilation
              orgId={orgId}
              biens={(biens ?? []) as { id: string; nom: string }[]}
            />
          </div>
          {/* La clôture est un geste d'admin — la base la refuse à l'agent */}
          {role !== "agent" && (
            <div className="border-t border-border pt-4">
              <FormulaireCloture orgId={orgId} moisCourant={moisCourant} />
              {moisClotures.size > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Mois déjà clôturés : {[...moisClotures].map(moisEnFrancais).join(", ")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Un rapport se rend à un mandant : le propriétaire direct n'en a pas */}
      {!estProprietaire && (
      <Card>
        <CardHeader>
          <CardTitle>Rapports de gestion</CardTitle>
          <CardDescription>
            Un rapport par mandant et par mois, une fois le mois clôturé. Une fois
            envoyé, il ne bouge plus ;
            versement suivi, écart alerté.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RapportsGestion
            orgId={orgId}
            mandats={mandats}
            rapports={(rapports ?? []) as RapportCompta[]}
            moisCourant={moisCourant}
          />
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <div className="entete-carte !mb-0">
            <CardTitle>Journal</CardTitle>
            {/* Deux portées : l'année en cours, celle que l'agent demande neuf
                fois sur dix, et la totalité pour l'expert-comptable. */}
            <span className="flex items-center gap-3">
              <a
                href={`/agence/${orgId}/comptabilite/export?du=${anneeCourante}-01-01&au=${anneeCourante}-12-31`}
                className="lien-discret py-2 sm:py-0"
              >
                Exporter {anneeCourante}
              </a>
              <a
                href={`/agence/${orgId}/comptabilite/export`}
                className="lien-discret py-2 sm:py-0"
              >
                Tout exporter
              </a>
            </span>
          </div>
          {/* Le journal s'arrêtait à 200 lignes sans le dire : un livre de
              trois ans passait pour complet. Et pour un agent, le plafond
              s'applique AVANT son portefeuille — sa page en montre encore
              moins. Les deux se disent. */}
          <CardDescription>
            {journalTronque
              ? portefeuille
                ? `Les écritures de votre portefeuille parmi les ${LIGNES_JOURNAL} plus récentes de l'agence. Le livre en contient davantage : l'export porte tout votre portefeuille.`
                : `Les ${LIGNES_JOURNAL} écritures les plus récentes, de la plus récente à la plus ancienne. Le livre en contient davantage : l'export les porte toutes.`
              : portefeuille
                ? "Les écritures de votre portefeuille, de la plus récente à la plus ancienne."
                : "Toutes les écritures, de la plus récente à la plus ancienne."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <div className="vide-guide">
              <p className="titre">Aucune écriture pour l&apos;instant</p>
              <p className="explication">
                {estProprietaire
                  ? "Les loyers encaissés s'inscrivent tout seuls, à mesure que vous les encaissez. Une dépense (travaux, charges, assurance) se saisit à la main, ci-dessus."
                  : "Les honoraires se créent tout seuls à chaque encaissement de loyer. Une dépense ou une recette d'agence se saisit à la main, ci-dessus."}
              </p>
            </div>
          ) : (
            <>
            {/* Sous sm, le journal passe en lignes empilées : montant et
                annulation restent à portée sans défilement horizontal. */}
            <ul className="space-y-3 sm:hidden">
              {lignes.map((e) => {
                const clot = moisClotures.has(e.date_imputation.slice(0, 7));
                return (
                  <li
                    key={e.id}
                    className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="mono-discret">{formaterDate(e.date_imputation)}</span>
                      <span
                        className={`montant font-medium whitespace-nowrap ${e.sens === "recette" ? "text-success" : ""}`}
                      >
                        {e.sens === "recette" ? "+" : "−"}
                        {eur(e.montant)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="puce puce-grise">{e.categorie}</span>
                      {e.contre_ecriture_de && (
                        <span className="text-xs text-muted-foreground">contre-écriture</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {e.libelle ? `${e.libelle} · ` : ""}
                      pièce {formaterDate(e.date_piece)}
                      {e.systeme ? " · créée automatiquement" : ""}
                    </p>
                    {!e.contre_ecriture_de && !clot && (
                      <BoutonContre orgId={orgId} ecritureId={e.id} />
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="tableau-defilant hidden sm:block">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Catégorie</th>
                    <th>Libellé</th>
                    <th className="nombre">Montant</th>
                    <th>
                      <span className="sr-only">Annulation</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((e) => {
                    const clot = moisClotures.has(e.date_imputation.slice(0, 7));
                    return (
                      <tr key={e.id}>
                        <td className="mono-discret whitespace-nowrap">
                          {formaterDate(e.date_imputation)}
                        </td>
                        <td>
                          <span className="puce puce-grise">{e.categorie}</span>
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {/* Sans libellé, la ligne commençait par un point médian orphelin. */}
                          {e.libelle ? `${e.libelle} · ` : ""}
                          pièce {formaterDate(e.date_piece)}
                          {e.systeme ? " · créée automatiquement" : ""}
                        </td>
                        <td
                          className={`nombre montant font-medium ${e.sens === "recette" ? "text-success" : ""}`}
                        >
                          {e.sens === "recette" ? "+" : "−"}
                          {eur(e.montant)}
                        </td>
                        <td className="text-right">
                          {!e.contre_ecriture_de && !clot && (
                            <BoutonContre orgId={orgId} ecritureId={e.id} />
                          )}
                          {e.contre_ecriture_de && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">contre-écriture</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
