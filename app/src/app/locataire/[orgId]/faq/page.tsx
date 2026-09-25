import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Questions fréquentes" };

// Les rubriques citées dans les réponses se cliquent (24/09) : le locataire
// devait retrouver l'entrée dans le menu. Lien souligné, à la taille du
// texte — .lien-discret (12 px, cible tactile en bloc) est fait pour un lien
// seul sur sa ligne, pas au milieu d'une phrase. Plus de guillemets autour
// des noms de rubrique : le lien suffit à les distinguer.
const LIEN_DANS_LE_TEXTE =
  "whitespace-nowrap font-medium text-[var(--bleu)] underline underline-offset-2";

// FAQ locataire (maquette v10) : les réponses aux questions qui reviennent,
// dans les mots du locataire — chacune vérifiée contre ce que fait vraiment
// l'application.
function questions(orgId: string): { question: string; reponse: ReactNode }[] {
  const rubrique = (chemin: string, nom: string) => (
    <Link href={`/locataire/${orgId}/${chemin}`} className={LIEN_DANS_LE_TEXTE}>
      {nom}
    </Link>
  );
  return [
    {
      question: "Quand vais-je recevoir ma quittance ?",
      reponse: (
        <>
          Dès que votre virement est encaissé par votre gestionnaire : la quittance
          est établie automatiquement et disponible dans {rubrique("loyers", "Mes paiements")} et{" "}
          {rubrique("documents", "Mes documents")}. Rien à demander. Un paiement partiel
          donne un simple reçu, transformé en quittance quand le mois est soldé.
        </>
      ),
    },
    {
      question: "Qui paie les réparations ?",
      reponse: (
        <>
          Avant toute intervention, votre gestionnaire examine votre demande et vous
          dit qui paie : le propriétaire, ou vous-même s&apos;il s&apos;agit d&apos;une
          petite réparation ou de l&apos;entretien courant du logement (par exemple un
          joint, une ampoule, un siphon à déboucher) — jamais de surprise sur la
          facture. Vous suivez chaque étape dans {rubrique("demandes", "Mes demandes")}.
        </>
      ),
    },
    {
      question: "Comment récupérer mon dépôt de garantie ?",
      reponse:
        "Il vous est restitué sous 1 mois après un état des lieux de sortie conforme à l'entrée (2 mois si des retenues sont justifiées, pièces à l'appui). L'usure normale du logement est déduite : elle ne peut pas vous être facturée.",
    },
    {
      question: "Comment donner mon congé ?",
      reponse: (
        <>
          Par lettre recommandée avec accusé de réception adressée à votre
          gestionnaire — c&apos;est elle qui fait courir le préavis, dès sa première
          présentation. Prévenez-le d&apos;abord depuis {rubrique("logement", "Mon logement")}{" "}
          (deux minutes) : il attendra votre courrier et confirmera votre date de
          fin de bail. Préavis : 1 mois en meublé ou en zone tendue, 3 mois sinon.
        </>
      ),
    },
    {
      question: "Mon assurance habitation est-elle obligatoire ?",
      reponse: (
        <>
          Oui, pendant toute la durée du bail. Déposez votre attestation chaque
          année dans {rubrique("documents#assurance", "Mes documents")} — une photo
          lisible suffit. Votre espace vous signale quand elle approche de
          l&apos;expiration.
        </>
      ),
    },
    {
      question: "Ma provision de charges, ça couvre quoi ?",
      reponse: (
        <>
          Les charges récupérables : eau, entretien des parties communes, une partie
          des taxes… Une fois par an, elle est comparée aux dépenses réelles : trop
          versé, on vous rembourse ; pas assez, un complément vous est demandé — le
          décompte détaillé arrive dans {rubrique("documents", "Mes documents")}. Au
          forfait (meublé), rien ne bouge : le forfait est définitif.
        </>
      ),
    },
  ];
}

export default async function PageFaqLocataire(props: PageProps<"/locataire/[orgId]/faq">) {
  const { orgId } = await props.params;
  const liste = questions(orgId);
  return (
    <div className="space-y-4">
      <div className="entete-page">
        <h1>Questions fréquentes</h1>
        {/* Plus de « 6 réponses » en capitales (25/09, D26) : le chiffre
            n'apprenait rien, la liste est sous les yeux. */}
      </div>
      {/* Deux colonnes au-delà de 1024 px (24/09) : en une seule, bridée à
          68 caractères, la carte laissait ses deux cinquièmes droits vides
          sur toute sa hauteur. La colonne borne déjà la ligne. */}
      <div className="loc-carte">
        <ul className="grid gap-x-10 lg:grid-cols-2">
          {liste.map(({ question, reponse }) => (
            <li
              key={question}
              className="border-b border-border py-3.5 first:pt-0 lg:[&:nth-child(2)]:pt-0"
            >
              <p className="text-sm font-semibold text-[var(--encre)]">{question}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{reponse}</p>
            </li>
          ))}
        </ul>
        {/* La seule action de la page, dans la carte et à la taille du texte
            (24/09) : c'était une note grise de 12 px sous le pied de carte. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
          <p className="text-sm text-muted-foreground">Une question sans réponse ici ?</p>
          <Link
            href={`/locataire/${orgId}/contact`}
            className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
          >
            Écrire à mon gestionnaire
          </Link>
        </div>
      </div>
    </div>
  );
}
