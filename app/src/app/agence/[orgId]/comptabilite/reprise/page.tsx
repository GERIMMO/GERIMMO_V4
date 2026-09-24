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
  const dateReprise = basculee ? basculee.basculee_le ?? basculee.date_bascule : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-7">
      {/* L'en-tête standard des sous-pages (24/09) : le retour au-dessus du
          titre, libellé du titre de la page qu'il rouvre (comme « ← lot » sur
          les fiches), puis le titre, sa mention et le filet de
          `.entete-page` — le Récapitulatif fiscal fait de même. */}
      <div>
        <Link
          href={`/agence/${orgId}/comptabilite`}
          className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:underline"
        >
          ← Comptabilité
        </Link>
        <div className="entete-page">
          <h1>Reprendre mes comptes</h1>
          <span className="mono-discret">
            Balance d&apos;ouverture ·{" "}
            {dateReprise ? `reprise le ${formaterDate(dateReprise)}` : "aucune reprise"}
          </span>
        </div>
        {/* « de Agence Alpha » : le nom s'insérait sans élision. La phrase le
            place désormais en sujet, et nomme les quatre natures de la liste. */}
        <p className="mesure-lecture text-sm text-muted-foreground">
          Votre balance d&apos;ouverture : ce que {organisation.name} détient au
          jour de la bascule. Dépôts de garantie, soldes des locataires,
          provisions pour charges et fonds des propriétaires — une ligne par
          solde, et le compte doit tomber juste.
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
        {/* Le gabarit est un exemple : bouton secondaire. Le geste qui fait
            avancer le parcours, « Contrôler la balance », porte le plein
            (24/09). */}
        <a href={`/agence/${orgId}/comptabilite/reprise/modele`} className="btn-secondaire mt-3">
          Télécharger le gabarit
        </a>

        {/* Ces quatre mots sont des VALEURS à recopier dans la colonne
            « type », pas des titres : l'amorce le dit et la police de code le
            montre. Code au-dessus de sa description sur téléphone, colonne
            alignée sur bureau (24/09). */}
        <p className="mt-4 text-sm">
          Dans la colonne <code className="mono-discret sans-majuscules">type</code>,
          écrivez l&apos;un de ces quatre mots, tel quel :
        </p>
        <dl className="mt-2 space-y-2 text-[13px]">
          {TYPES_SOLDE.map(([cle, quoi]) => (
            <div key={cle} className="grid gap-x-3 sm:grid-cols-[10rem_1fr]">
              <dt>
                <code className="mono-discret sans-majuscules text-[var(--corps)]">{cle}</code>
              </dt>
              <dd className="text-muted-foreground">{quoi}</dd>
            </div>
          ))}
        </dl>

        {/* Ouvert, et non plus replié derrière « Les colonnes, une par une » :
            c'est ce qu'il faut lire pour préparer le fichier (24/09). */}
        <h4 className="mt-5 text-sm font-semibold text-[var(--encre)]">Les colonnes du fichier</h4>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-[13px] text-muted-foreground sm:grid-cols-2">
          {COLONNES.map(([cle, libelle, requise]) => (
            <li key={cle}>
              <span className={requise ? "font-medium text-[var(--corps)]" : ""}>
                {/* Le libellé de la colonne « type » énumère les quatre codes
                    (il sert aussi d'en-tête au gabarit CSV) : ici, la liste
                    juste au-dessus les donne déjà. */}
                {cle === "type" ? "Type — l'une des quatre natures ci-dessus" : libelle}
              </span>
              {requise && <span className="text-[var(--destructive)]"> — obligatoire</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Le locataire se retrouve par son email, ou par le nom de son lot (et
          de son bien). Le propriétaire, par son email. Un dépôt exige son
          détenteur : sans lui, personne ne sait qui le rendra.
        </p>
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

      {/* Les conséquences les plus lourdes de la reprise ne sont pas des
          mentions légales : elles quittent le 12 px gris hors carte pour une
          carte lisible (24/09). L'irréversibilité de la bascule, elle, se dit
          dans la carte 2, au-dessus du bouton « Basculer » — là où l'on clique. */}
      <section className="loc-carte space-y-2 text-sm">
        <div className="entete-carte">
          <h3>À savoir avant de basculer</h3>
        </div>
        <p>
          <b>Une dette de locataire n&apos;est pas écrite au compte.</b> Elle
          serait un appel de loyer pour une période que vos comptes ici
          n&apos;ont pas connue : elle polluerait l&apos;échéancier et
          déclencherait des quittances fausses. Elle est enregistrée dans la
          balance, signalée, et reste à traiter par le parcours de relance.
        </p>
        <p>
          <b>Un dépôt détenu par le propriétaire</b> est enregistré lui aussi,
          mais n&apos;entre pas dans votre trésorerie : vous ne l&apos;avez pas.
        </p>
      </section>
    </main>
  );
}
