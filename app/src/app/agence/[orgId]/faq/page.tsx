import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { ecranSansDonnees } from "@/lib/retours";
import { EnteteReglages } from "../profil/famille-reglages";

export const metadata = { title: "Questions fréquentes — Gerimmo" };

// FAQ du propriétaire bailleur (maquette PC v1) — chaque réponse vérifiée
// contre ce que fait vraiment l'application.
const QUESTIONS: [string, string][] = [
  [
    "Que fait Gerimmo tout seul, et que me reste-t-il ?",
    "Les quittances s'émettent à l'encaissement, les écritures de loyer s'inscrivent seules au livre, les échéances (assurance du locataire, diagnostics, révision IRL) déclenchent des alertes. Vous ne gardez que les décisions : encaisser, valider, signer.",
  ],
  [
    "Comment mes locataires me joignent-ils ?",
    "Chaque locataire a son espace : il vous écrit depuis «\u00a0Mon gestionnaire\u00a0» (vous répondez depuis «\u00a0Messages\u00a0»), signale un incident photo à l'appui, dépose ses pièces quand vous les réclamez, et peut donner son congé en ligne — vous êtes alerté à chaque fois.",
  ],
  [
    "Ma SCI et mon nom propre sont-ils mélangés ?",
    "Jamais : chaque espace (votre SCI, votre nom propre) a ses lots, son livre et sa fiscalité. Si vous en avez plusieurs, la bascule se fait par le sélecteur d'espace (en haut de la barre de gauche sur ordinateur, dans « Menu » sur téléphone) — tout suit.",
  ],
  [
    "Le meublé est-il dans le récapitulatif fiscal ?",
    "Non : les revenus d'une location meublée relèvent des BIC, pas des revenus fonciers. Le récapitulatif 2044 les écarte et vous en donne le total à part ; la gestion (bail, quittances, incidents, livre) reste complète.",
  ],
  [
    "Un lot en indivision, comment je déclare ?",
    "Le récapitulatif ajoute une colonne «\u00a0votre quote-part\u00a0» : chaque rubrique est ventilée à votre pourcentage de détention — c'est cette colonne qui se recopie sur votre 2044, chaque indivisaire déclarant la sienne.",
  ],
  [
    "Comment choisir mon abonnement ?",
    "Les fonctionnalités de gestion sont identiques entre les formules particuliers ; le prix dépend du nombre de biens activement gérés. « Mon abonnement » propose la formule la moins chère adaptée à votre parc et à votre choix mensuel ou annuel. Une SCI qui gère ses propres biens relève de cette même grille. Les contrats et avantages déjà accordés sont préservés jusqu’à un changement convenu avec vous.",
  ],
  [
    "Que se passe-t-il à la fin de mon essai ?",
    "L’essai dure 14 jours sans carte bancaire. Aucun débit sans souscription explicite, même pour un seul bien. Si vous souscrivez avant sa fin, vos jours restants sont conservés et la date du premier prélèvement est affichée. Sinon, vos données restent consultables et exportables en lecture seule.",
  ],
  [
    "Puis-je changer de formule ou résilier ?",
    "Toute augmentation payante indique le nouveau montant, sa date et son prorata avant votre accord. Après un archivage ou une fin de mandat, ouvrez « Mon abonnement » pour demander et confirmer la baisse adaptée à votre nouveau volume. Elle prendra effet à la prochaine échéance, si votre nombre de biens le permet ; elle n’est pas programmée automatiquement par l’archivage. Le mensuel n’engage pas pour un an. L’annuel est prélevé en une fois pour douze mois et renouvelé à l’échéance, sauf résiliation. Dans les deux cas, les droits payés restent acquis jusqu’à la fin de la période, puis les données restent consultables et exportables.",
  ],
  [
    "Quels biens sont comptés ?",
    "Les biens activement gérés, occupés ou vacants. Les biens archivés restent consultables et sortent du volume à prendre en compte pour la prochaine échéance. Un logement avec ses annexes sur le même bail compte pour un bien ; un parking loué séparément compte pour un bien distinct. Une restauration nécessitant plus de capacité demande votre accord préalable.",
  ],
  [
    "Mes locataires ou mes accès invités doivent-ils payer ?",
    "Non. Les accès locataires sont inclus. Si une agence vous invite pour consulter les biens qu’elle gère pour vous, cet espace est inclus dans son abonnement. Vos autres biens gérés vous-même restent dans un espace personnel distinct, avec sa propre facturation.",
  ],
  [
    "Les artisans et les signatures sont-ils inclus en illimité ?",
    "La gestion fonctionne partout en France. Le réseau d’artisans dépend de la commune du bien et du métier ouvert ; cela ne change pas le prix de votre abonnement. Les travaux sont facturés séparément sur devis. Les signatures électroniques, SMS et autres prestations externes payantes ne sont pas inclus en illimité : leurs éventuelles conditions sont présentées séparément, avant accord.",
  ],
  [
    "Gerimmo lit-il mes comptes bancaires ?",
    "Non, jamais : la comptabilité est déclarative. Vous enregistrez l'encaissement en un clic, l'écriture s'inscrit — et une écriture validée ne se modifie plus, elle se corrige par une écriture rectificative, visible.",
  ],
];

export default async function PageFaqProprietaire(props: PageProps<"/agence/[orgId]/faq">) {
  const { orgId } = await props.params;
  const { estProprietaire, organisation } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre="Questions fréquentes" mention={organisation.name}>
        {/* 24/09 : la phrase finissait sur « chaque réponse vérifiée contre le
            comportement réel de l'application » — le commentaire du code
            recopié à l'écran, qui laissait entendre l'inverse. */}
        Ce que Gerimmo fait seul, ce qu&apos;il ne fait pas, et ce que coûte
        votre abonnement.
      </EnteteReglages>

      <div className="loc-carte">
        {/* Une question et sa réponse : une liste de définitions, pas des
            paragraphes en gras — le lecteur d'écran annonce la paire. */}
        <dl className="divide-y divide-border">
          {QUESTIONS.map(([q, r]) => (
            <div key={q} className="py-3.5 first:pt-0 last:pb-0">
              <dt className="text-sm font-semibold text-[var(--encre)]">{q}</dt>
              <dd className="mesure-lecture mt-1 text-sm leading-relaxed text-muted-foreground">
                {r}
              </dd>
            </div>
          ))}
        </dl>
        {/* 24/09 : la FAQ se terminait sans issue. Même lien que « Aide et
            retours » de la barre du haut : l'écran part anonymisé avec la
            demande, le chemin réel ne sert qu'au retour. */}
        <p className="mt-3.5 border-t border-border pt-3.5 text-sm text-muted-foreground">
          Votre question n&apos;est pas là ?{" "}
          <Link
            href={`/assistance?ecran=${encodeURIComponent(ecranSansDonnees(`/agence/${orgId}/faq`))}&action=lien&retour=${encodeURIComponent(`/agence/${orgId}/faq`)}`}
            className="lien-discret whitespace-nowrap"
          >
            Écrivez-nous — Aide et retours
          </Link>
        </p>
      </div>
    </main>
  );
}
