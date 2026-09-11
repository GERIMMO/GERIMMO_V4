import Link from "next/link";
import { eur, formaterDate } from "@/lib/ged";
import { COULEURS_STATUT_APPEL_LOYER, STATUTS_APPEL_LOYER } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { aEchoue, LectureImpossible, PanneLecture } from "../panne-lecture";
import { tagLocataire } from "../pastille-locataire";
import type { BailLocataire } from "../types";

export const metadata = { title: "Mes paiements — Gerimmo" };

// « Mes paiements » (maquette v10) : la prochaine échéance, les douze
// derniers mois en pastilles, les quittances, et les charges expliquées.
export default async function PagePaiementsLocataire(
  props: PageProps<"/locataire/[orgId]/loyers">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: echeancier, error: eEcheancier },
    { data: bauxRows, error: eBaux },
    { data: restitutions, error: eRestitution },
    { data: retenuesRows, error: eRetenues },
    { data: relancesRows, error: eRelances },
  ] = await Promise.all([
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("ma_restitution_locataire", { p_org: orgId }),
    supabase.rpc("mes_retenues_restitution", { p_org: orgId }),
    supabase.rpc("mes_relances_locataire", { p_org: orgId }),
  ]);
  const restitution = ((restitutions ?? []) as {
    statut: string;
    date_remise_cles: string;
    delai_mois: number;
    depot: number;
    impayes: number | null;
    solde: number | null;
    date_emission: string | null;
    sans_edl_entree: boolean | null;
  }[])[0];
  const retenues = (retenuesRows ?? []) as {
    libelle: string;
    cout: number;
    duree_vie_ans: number | null;
    age_ans: number | null;
    montant_retenu: number;
    justificatif_document: string | null;
  }[];
  const relances = (relancesRows ?? []) as {
    niveau: string;
    date_envoi: string;
    date_premiere_presentation: string | null;
  }[];
  const NIVEAUX_RELANCE: Record<string, string> = {
    relance_1: "Relance simple",
    relance_2: "Seconde relance",
    mise_en_demeure: "Mise en demeure (lettre recommandée)",
  };
  const lignesLoyer = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
    quittance_id: string | null;
  }[];
  const bail = ((bauxRows ?? []) as BailLocataire[])[0];

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const prochaine = lignesLoyer.find((l) => l.statut !== "paye");
  const forfait = bail?.charges_mode === "forfait";
  const quittances = lignesLoyer.filter((l) => l.quittance_id);
  // Les 12 derniers mois en pastilles : payé plein, à venir cerclé laiton,
  // impayé rouge — le « parcours » du locataire en un regard.
  const douzeDerniers = lignesLoyer.slice(-12);
  const payes = douzeDerniers.filter((l) => l.statut === "paye").length;
  // Les pastilles ne parlent qu'au survol (title) : au tactile, les mois
  // restant à régler sont nommés en clair sous la frise.
  const aRegler = douzeDerniers.filter(
    (l) => l.statut !== "paye" && l.statut !== "attendu"
  );
  // Bail actif et tout soldé (audit 09/09) : la prochaine échéance réelle —
  // le jour d'échéance du bail, au mois suivant
  const dateActuelle = new Date();
  const moisSuivant = new Date(
    Date.UTC(dateActuelle.getFullYear(), dateActuelle.getMonth() + 1, 1)
  ).toISOString();

  const pastilles = douzeDerniers.length > 1 && (
    <>
      <div className="loc-pts" aria-hidden>
        {douzeDerniers.map((l) => (
          <i
            key={l.periode}
            className={l.statut === "paye" ? "v" : l.statut === "attendu" ? "a" : "r"}
            title={`${moisLong(l.periode)} — ${STATUTS_APPEL_LOYER[l.statut] ?? l.statut}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Vos {douzeDerniers.length} derniers mois — {payes} réglé
        {payes > 1 ? "s" : ""}
        {aRegler.length === 0 ? ". Un parcours sans faute." : "."}
        {aRegler.length > 0 &&
          ` Reste à régler : ${aRegler
            .map(
              (l) =>
                `${moisLong(l.periode)} (${(STATUTS_APPEL_LOYER[l.statut] ?? l.statut).toLowerCase()})`
            )
            .join(", ")}.`}
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="entete-page">
        <h1>Mes paiements</h1>
        {bail?.jour_echeance != null && (
          <span className="mono-discret">
            Loyer dû le {bail.jour_echeance === 1 ? "1ᵉʳ" : bail.jour_echeance} du mois
          </span>
        )}
      </div>

      {aEchoue(eEcheancier, eBaux, eRestitution, eRetenues, eRelances) && (
        <PanneLecture quoi="vos paiements" />
      )}

      {/* Deux colonnes égales en large. En classe (pas en style inline) pour
          que la media query 860 px de .loc-grille garde la main sur mobile ;
          le ! est requis, .loc-grille étant du CSS hors layer. */}
      <div className="loc-grille min-[861px]:!grid-cols-2">
        <div className="space-y-4">
          <div className="loc-carte">
            <div className="entete-carte !mb-1">
              <h3 className="text-base font-medium">Prochain loyer</h3>
              {aEchoue(eEcheancier, eBaux) ? null : prochaine ? (
                <span className="loc-tag bleu capitalize">{moisLong(prochaine.periode)}</span>
              ) : bail ? (
                <span className="loc-tag vert">À jour</span>
              ) : null}
            </div>
            {aEchoue(eEcheancier, eBaux) ? (
              <LectureImpossible quoi="votre échéancier" />
            ) : prochaine && bail ? (
              <>
                {/* Le RESTE dû, comme sur l'accueil : les deux écrans
                    affichaient deux montants différents dès qu'un mois était
                    partiellement couvert. */}
                <p className="montant font-heading text-3xl text-[var(--encre)]">
                  {eur(Number(prochaine.montant_du) - Number(prochaine.montant_couvert))}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {eur(Number(bail.loyer_hc ?? 0))} de loyer + {eur(Number(bail.charges ?? 0))} de{" "}
                  {forfait ? "forfait" : "provision"} de charges — à régler par
                  virement à votre gestionnaire.
                  {prochaine.statut === "partiel"
                    ? ` Déjà réglé : ${eur(Number(prochaine.montant_couvert))}.`
                    : ""}
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Dès l&apos;encaissement, votre quittance est établie et disponible
                  ici — rien à demander. Le premier loyer d&apos;un bail est
                  quittancé au prorata de la date d&apos;entrée.
                </p>
                {pastilles}
              </>
            ) : bail ? (
              // Bail actif, aucun impayé (audit 09/09) : dire « à jour »
              // plutôt que renvoyer à une activation déjà faite
              <>
                <p className="text-sm text-success-soft-foreground">
                  Tous vos loyers sont à jour — rien à régler pour l&apos;instant.
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Prochaine échéance{" "}
                  {bail.jour_echeance != null
                    ? `le ${bail.jour_echeance === 1 ? "1ᵉʳ" : bail.jour_echeance} ${moisLong(moisSuivant)}`
                    : `en ${moisLong(moisSuivant)}`}
                  .
                </p>
                {pastilles}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Rien à régler pour l&apos;instant — votre échéancier apparaîtra ici
                dès l&apos;activation de votre bail.
              </p>
            )}
          </div>

          {bail && (
            <div className="loc-carte">
              <div className="entete-carte !mb-1">
                <h3 className="text-base font-medium">Vos charges</h3>
              </div>
              <p className="text-[13px] text-muted-foreground">
                {forfait
                  ? `Forfait de ${eur(Number(bail.charges ?? 0))} par mois : il couvre les charges sans régularisation — aucun décompte annuel à attendre.`
                  : `Provision de ${eur(Number(bail.charges ?? 0))} par mois : une fois par an, votre gestionnaire la compare aux charges réelles. Le décompte de régularisation arrive dans Mes documents — vous ne payez que ce qui a été réellement dépensé.`}
              </p>
            </div>
          )}
        </div>

        <div className="loc-carte">
          <div className="entete-carte">
            <h3 className="text-base font-medium">Mes quittances</h3>
            {/* La liste montre TOUS les mois de l'échéancier : dire seulement
                « N émises » laissait croire à un compte tronqué. */}
            {!aEchoue(eEcheancier) && lignesLoyer.length > 0 && (
              <span className="mono-discret">
                {quittances.length} émise{quittances.length > 1 ? "s" : ""} sur{" "}
                {lignesLoyer.length} mois
              </span>
            )}
          </div>
          {aEchoue(eEcheancier) ? (
            <LectureImpossible quoi="vos quittances" />
          ) : lignesLoyer.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Vos quittances apparaîtront ici après votre premier loyer réglé.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {[...lignesLoyer].reverse().map((l) => (
                <li key={l.periode} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-32 shrink-0 capitalize">{moisLong(l.periode)}</span>
                  <span className="montant w-24 shrink-0 text-right">{eur(l.montant_du)}</span>
                  <span className="min-w-0 flex-1" />
                  <span
                    className={`shrink-0 ${tagLocataire(COULEURS_STATUT_APPEL_LOYER[l.statut])}`}
                  >
                    {STATUTS_APPEL_LOYER[l.statut] ?? l.statut}
                  </span>
                  {l.quittance_id && (
                    // Lien stylé en bouton : hors du filet tactile du socle
                    // (button/select), d'où le min-h au pointeur grossier
                    <Link
                      href={`/quittance/${l.quittance_id}`}
                      target="_blank"
                      className={`shrink-0 pointer-coarse:min-h-10 ${buttonVariants({ variant: "ghost", size: "sm" })}`}
                    >
                      Ouvrir
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Vos quittances restent disponibles ici pendant toute la durée du
            bail — utiles pour la CAF ou un futur dossier de location.
          </p>
          <Link
            href={`/attestation-loyer/${orgId}`}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3 pointer-coarse:min-h-10`}
          >
            Attestation de bon paiement
          </Link>
        </div>
      </div>

      {/* Relances reçues (module 3.12) — sans les notes internes de l'agence */}
      {relances.length > 0 && (
        <div className="loc-carte border-l-4 border-l-[var(--warning)]">
          <h3 className="text-base font-medium">Relances reçues</h3>
          <ul className="mt-2 divide-y divide-border">
            {relances.map((r, ix) => (
              <li key={ix} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {NIVEAUX_RELANCE[r.niveau] ?? r.niveau}
                  <small className="block text-muted-foreground">
                    envoyée le {formaterDate(r.date_envoi)}
                    {r.date_premiere_presentation
                      ? ` · présentée le ${formaterDate(r.date_premiere_presentation)}`
                      : ""}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Une difficulté de paiement ? Écrivez à votre gestionnaire : une
            solution se trouve toujours plus tôt que tard.
          </p>
        </div>
      )}

      {/* Restitution du dépôt de garantie (module 2.7) : le suivi dès la
          remise des clés, le décompte détaillé seulement une fois établi */}
      {restitution && (
        <div className="loc-carte">
          <div className="entete-carte !mb-1">
            <h3 className="text-base font-medium">Votre dépôt de garantie</h3>
            <span className={`loc-tag ${restitution.statut === "finalise" ? "vert" : "bleu"}`}>
              {restitution.statut === "finalise" ? "Décompte établi" : "Restitution en cours"}
            </span>
          </div>
          {restitution.statut !== "finalise" ? (
            <p className="text-sm text-muted-foreground">
              Clés remises le {formaterDate(restitution.date_remise_cles)} :
              votre dépôt de {eur(Number(restitution.depot))} doit vous être
              restitué sous {restitution.delai_mois} mois
              {restitution.delai_mois === 2
                ? restitution.sans_edl_entree
                  ? " (sans état des lieux d'entrée, la restitution est intégrale)"
                  : " (des écarts ont été relevés à l'état des lieux — les retenues seront justifiées, pièces à l'appui)"
                : " (état des lieux conforme)"}
              . Le décompte détaillé apparaîtra ici dès qu&apos;il sera établi.
            </p>
          ) : (
            <>
              <div className="mt-1">
                <div className="ligne-info">
                  <span>Dépôt versé</span>
                  <span className="montant">{eur(Number(restitution.depot))}</span>
                </div>
                {Number(restitution.impayes ?? 0) > 0 && (
                  <div className="ligne-info">
                    <span>Loyers restés dus, imputés d&apos;abord</span>
                    <span className="montant">− {eur(Number(restitution.impayes))}</span>
                  </div>
                )}
                {/* Sans les retenues, le solde ne se déduit plus des lignes
                    affichées : mieux vaut le dire que laisser un décompte qui
                    ne tombe pas juste. */}
                {aEchoue(eRetenues) && (
                  <div className="ligne-info">
                    <span className="text-destructive-soft-foreground">
                      Le détail des retenues n&apos;a pas pu être lu — le solde
                      ci-dessous ne se déduit donc pas des lignes affichées.
                    </span>
                  </div>
                )}
                {retenues.map((r, ix) => (
                  <div key={ix} className="ligne-info">
                    <span>
                      {r.libelle}
                      <small className="block text-muted-foreground">
                        coût {eur(Number(r.cout))}
                        {r.age_ans != null && r.duree_vie_ans != null
                          ? ` · vétusté déduite (${Number(r.age_ans).toLocaleString("fr-FR")} an${Number(r.age_ans) > 1 ? "s" : ""} sur ${Number(r.duree_vie_ans).toLocaleString("fr-FR")})`
                          : ""}
                        {r.justificatif_document && (
                          <>
                            {" · "}
                            <a
                              href={`/locataire/${orgId}/documents/${r.justificatif_document}/fichier`}
                              target="_blank"
                              rel="noopener"
                              className="lien-discret"
                            >
                              justificatif
                            </a>
                          </>
                        )}
                      </small>
                    </span>
                    <span className="montant">− {eur(Number(r.montant_retenu))}</span>
                  </div>
                ))}
                <div className="ligne-info font-medium">
                  <span className="!text-foreground">
                    {Number(restitution.solde ?? 0) >= 0 ? "À vous restituer" : "Restant dû"}
                  </span>
                  <span className="montant">{eur(Math.abs(Number(restitution.solde ?? 0)))}</span>
                </div>
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Décompte établi le{" "}
                {restitution.date_emission ? formaterDate(restitution.date_emission) : "—"}. L&apos;usure
                normale du logement est déduite des retenues (décote de
                vétusté) : elle ne peut pas vous être facturée. Un désaccord ?{" "}
                <Link href={`/locataire/${orgId}/contact`} className="lien-discret">
                  Écrivez à votre gestionnaire
                </Link>
                .
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
