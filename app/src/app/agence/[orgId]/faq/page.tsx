import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
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
    "Chaque locataire a son espace : il vous écrit depuis « Mon gestionnaire » (vous répondez depuis sa fiche), signale un incident photo à l'appui, dépose ses pièces quand vous les réclamez, et peut donner son congé en ligne — vous êtes alerté à chaque fois.",
  ],
  [
    "Ma SCI et mon nom propre sont-ils mélangés ?",
    "Jamais : chaque organisation a ses lots, son livre et sa fiscalité. Si vous en avez plusieurs, la bascule se fait dans la barre de gauche — tout suit.",
  ],
  [
    "Le meublé est-il dans le récapitulatif fiscal ?",
    "Non : les revenus d'une location meublée relèvent des BIC, pas des revenus fonciers. Le récapitulatif 2044 les écarte et vous en donne le total à part ; la gestion (bail, quittances, incidents, livre) reste complète.",
  ],
  [
    "Un lot en indivision, comment je déclare ?",
    "Le récapitulatif ajoute une colonne « votre quote-part » : chaque rubrique est ventilée à votre pourcentage de détention — c'est cette colonne qui se recopie sur votre 2044, chaque indivisaire déclarant la sienne.",
  ],
  [
    "Combien ça coûte ?",
    "Votre premier bien est offert, à vie. Chaque bien supplémentaire coûte 5,99 € par mois, tout compris, sans engagement — un bien retiré n'est plus compté le mois suivant.",
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
        Ce que Gerimmo fait seul, ce qu&apos;il ne fait pas, et ce que coûte
        votre abonnement — chaque réponse vérifiée contre le comportement réel
        de l&apos;application.
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
      </div>
    </main>
  );
}
