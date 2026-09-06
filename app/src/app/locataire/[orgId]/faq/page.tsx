import Link from "next/link";

export const metadata = { title: "Questions fréquentes — Gerimmo" };

// FAQ locataire (maquette v10) : les réponses aux questions qui reviennent,
// dans les mots du locataire — chacune vérifiée contre ce que fait vraiment
// l'application.
const QUESTIONS: [string, string][] = [
  [
    "Quand vais-je recevoir ma quittance ?",
    "Dès que votre virement est encaissé par votre gestionnaire : la quittance est établie automatiquement et disponible dans Mes paiements et Mes documents. Rien à demander. Un paiement partiel donne un simple reçu, transformé en quittance quand le mois est soldé.",
  ],
  [
    "Qui paie les réparations ?",
    "Avant toute intervention, votre demande est qualifiée : on vous dit si la réparation relève du propriétaire ou de l'entretien locatif — jamais de surprise sur la facture. Vous suivez chaque étape dans « Signaler un problème ».",
  ],
  [
    "Comment récupérer mon dépôt de garantie ?",
    "Il vous est restitué sous 1 mois après un état des lieux de sortie conforme à l'entrée (2 mois si des retenues sont justifiées, pièces à l'appui). L'usure normale du logement est déduite : elle ne peut pas vous être facturée.",
  ],
  [
    "Comment donner mon congé ?",
    "Par lettre recommandée avec accusé de réception adressée à votre gestionnaire — c'est elle qui fait courir le préavis, dès sa première présentation. Prévenez-le d'abord depuis « Mon logement » (deux minutes) : il attendra votre courrier et confirmera votre date de fin de bail. Préavis : 1 mois en meublé ou en zone tendue, 3 mois sinon.",
  ],
  [
    "Mon assurance habitation est-elle obligatoire ?",
    "Oui, pendant toute la durée du bail. Déposez votre attestation chaque année dans Mes documents — une photo lisible suffit. Votre espace vous signale quand elle approche de l'expiration.",
  ],
  [
    "Ma provision de charges, ça couvre quoi ?",
    "Les charges récupérables : eau, entretien des parties communes, une partie des taxes… Une fois par an, elle est comparée aux dépenses réelles : trop versé, on vous rembourse ; pas assez, un complément vous est demandé — le décompte détaillé arrive dans Mes documents. Au forfait (meublé), rien ne bouge : le forfait est définitif.",
  ],
];

export default async function PageFaqLocataire(props: PageProps<"/locataire/[orgId]/faq">) {
  const { orgId } = await props.params;
  return (
    <div className="space-y-4">
      <h1>Questions fréquentes</h1>
      <div className="loc-carte">
        <ul className="divide-y divide-border">
          {QUESTIONS.map(([q, r]) => (
            <li key={q} className="py-3.5 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold text-[var(--encre)]">{q}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Une question sans réponse ici ?{" "}
        <Link href={`/locataire/${orgId}/contact`} className="lien-discret">
          Écrivez à votre gestionnaire
        </Link>
        .
      </p>
    </div>
  );
}
