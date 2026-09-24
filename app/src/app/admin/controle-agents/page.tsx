import Link from "next/link";
export const metadata = {title: "Votre contrôle sur les agents — Gerimmo"};
export default function Page() {
 return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-7">
  <div className="entete-page"><div><h1>Vous décidez, les agents attendent</h1><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Le travail programmé de Gerimmo est suspendu à votre demande.</p></div></div>
  <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="text-xl font-semibold">Aucun nouveau passage automatique</h2><p className="mt-3">Les avis d’échéance, quittances, relances, rappels, traitements d’abonnement, suivis de signature, publications et études territoriales ne sont plus lancés par le planning de Gerimmo.</p><p className="mt-3">Cette pause ne peut pas être levée par un réglage ancien. Un traitement déjà commencé peut toutefois se terminer.</p></section>
  <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-semibold">Ce qui reste accessible</h2><p className="mt-3">Les utilisateurs peuvent continuer à consulter et gérer leurs dossiers. Les boutons métier qu’ils utilisent eux-mêmes restent accessibles.</p><p className="mt-3">Les paiements, signatures ou publicités déjà engagés auprès d’un prestataire ne sont pas annulés par cette pause. Leurs confirmations continuent d’être reçues par Gerimmo.</p></section>
  <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-semibold">La validation action par action est en préparation</h2><p className="mt-3">Chaque proposition devra indiquer ce qui sera fait, pour qui, avec quel contenu et quel coût. Votre accord portera sur cette seule action. Une modification nécessitera un nouvel accord.</p><p className="mt-3">Sans votre réponse, aucune proposition ne devra être exécutée. La file de validation n’est pas encore disponible ; les agents restent donc en pause.</p></section>
  <Link href="/admin" className="btn-secondaire">Revenir à la supervision</Link>
 </main>;
}
