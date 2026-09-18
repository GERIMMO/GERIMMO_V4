import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES, eur, formaterDate } from "@/lib/ged";
import { COLONNES, TYPES_SOLDE } from "@/lib/reprise-soldes";
import { FormulaireReprise } from "./formulaire-reprise";

export const metadata = { title: "Reprendre mes comptes — Gerimmo" };

/**
 * La reprise de portefeuille COMPTABLE (module 16 : balance d'ouverture à
 * écart zéro).
 *
 * L'import du parc, à côté, reprend les biens, les lots et les baux — pas
 * l'argent. Une agence qui bascule en cours d'exercice détient pourtant des
 * dépôts de garantie, des avances de locataires et des fonds de propriétaires
 * qu'elle ressaisissait jusqu'ici à la main, ligne par ligne, dans des écrans
 * qui n'étaient pas faits pour ça.
 */
export default async function PageRepriseComptable(
  props: PageProps<"/agence/[orgId]/comptabilite/reprise">
) {
  const { orgId } = await props.params;
  const { supabase, role, organisation } = await verifierAccesEspace(orgId);
  // Une balance d'ouverture engage tout le portefeuille : elle appartient au
  // responsable. La base le revérifie (ouvrir_reprise, reprendre_soldes).
  if (!role || !ROLES_RESPONSABLES.includes(role)) notFound();

  // Ce qui a déjà été repris : une bascule est définitive, et la page doit le
  // dire avant qu'on en lance une seconde.
  const { data: reprises } = await supabase
    .from("reprises_portefeuille")
    .select("id, statut, date_bascule, tresorerie_annoncee, basculee_le, totaux")
    .eq("organization_id", orgId)
    .order("cree_le", { ascending: false })
    .limit(5);
  const passees = (reprises ?? []) as {
    id: string;
    statut: string;
    date_bascule: string | null;
    tresorerie_annoncee: string | null;
    basculee_le: string | null;
  }[];
  const basculee = passees.find((r) => r.statut === "basculee");

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-7">
      <div>
        <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret text-[13px]">
          ← Comptabilité
        </Link>
        <h1 className="mt-2">Reprendre mes comptes</h1>
        <p className="mesure-lecture mt-1 text-sm text-muted-foreground">
          La balance d&apos;ouverture de {organisation.name} : ce que vous
          détenez au jour de la bascule. Dépôts de garantie, avances des
          locataires, fonds des propriétaires — une ligne par solde, et le
          compte doit tomber juste.
        </p>
      </div>

      {basculee && (
        <p role="status" className="loc-carte text-sm">
          <b className="font-semibold">Une balance a déjà été reprise</b> le{" "}
          {formaterDate(basculee.basculee_le ?? basculee.date_bascule ?? "")}, pour{" "}
          {eur(basculee.tresorerie_annoncee)}. Une bascule est définitive : les
          corrections passent par des écritures rectificatives, pas par une
          seconde reprise.
        </p>
      )}

      <section className="loc-carte">
        <div className="entete-carte">
          <h3>1. Le gabarit</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Quatre questions par ligne : de quoi s&apos;agit-il, combien, pour qui,
          et qui détient l&apos;argent. Partez de ce fichier ou de l&apos;export
          de votre outil actuel — les en-têtes sont reconnus sans accents ni
          casse, et les colonnes inconnues sont ignorées, pas refusées.
        </p>
        <a href={`/agence/${orgId}/comptabilite/reprise/modele`} className="btn-or mt-3">
          Télécharger le gabarit
        </a>

        <dl className="mt-4 space-y-2 text-[13px]">
          {TYPES_SOLDE.map(([cle, quoi]) => (
            <div key={cle} className="flex flex-wrap gap-x-2">
              <dt className="font-[family-name:var(--font-libelles)] font-semibold text-[var(--corps)]">
                {cle}
              </dt>
              <dd className="text-muted-foreground">{quoi}</dd>
            </div>
          ))}
        </dl>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm">Les colonnes, une par une</summary>
          <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
            {COLONNES.map(([cle, libelle, requise]) => (
              <li key={cle}>
                <span className={requise ? "font-medium text-[var(--corps)]" : ""}>{libelle}</span>
                {requise && <span className="text-[var(--destructive)]"> — obligatoire</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Le locataire se retrouve par son email, ou par le nom de son lot (et
            de son bien). Le propriétaire, par son email. Un dépôt exige son
            détenteur : sans lui, personne ne sait qui le rendra.
          </p>
        </details>
      </section>

      <section className="loc-carte">
        <div className="entete-carte">
          <h3>2. Le contrôle, puis la bascule</h3>
        </div>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Le contrôle n&apos;écrit rien : il dit, ligne par ligne, ce qui
          passera, et affiche l&apos;écart entre ce que vous annoncez et ce que
          le détail justifie. La bascule ne s&apos;ouvre qu&apos;à écart nul.
        </p>
        <FormulaireReprise orgId={orgId} />
      </section>

      <div className="mesure-lecture space-y-2 text-xs text-muted-foreground">
        <p>
          <b>Une dette de locataire n&apos;est pas écrite au compte.</b> Elle
          serait un appel de loyer pour une période que Gerimmo n&apos;a pas
          connue : elle polluerait l&apos;échéancier et déclencherait des
          quittances fausses. Elle est enregistrée dans la balance, signalée, et
          reste à traiter par le parcours de relance.
        </p>
        <p>
          <b>Un dépôt détenu par le propriétaire</b> est enregistré lui aussi,
          mais n&apos;entre pas dans votre trésorerie : vous ne l&apos;avez pas.
        </p>
        <p>
          <b>La bascule est définitive.</b> Après elle, on corrige par écritures
          rectificatives — c&apos;est ce qu&apos;exige une comptabilité, et ce
          qui vous protège.
        </p>
      </div>
    </main>
  );
}
