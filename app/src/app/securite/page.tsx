import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FormulaireDeconnexion } from '@/components/formulaire-deconnexion';
import { PurgerCopiesAutresComptes } from "@/components/purger-copies-autres-comptes";
import { MarqueGerimmo } from '@/components/marque-gerimmo';
import { FormulaireMfa } from './formulaire-mfa';
import { aUnFacteurVerifie, destinationApresMfa } from '@/lib/mfa';

export const metadata = { title: 'Sécurité du compte — Gerimmo' };

export default async function PageSecurite({ searchParams }: PageProps<'/securite'>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/connexion');
  // Lire son propre rôle reste possible avant le second facteur ; aucune
  // autorisation de supervision n'est accordée par cette lecture.
  const { data: adhesion, error } = await supabase.from('memberships').select('id')
    .eq('account_id', user.id).eq('role', 'super_admin').eq('status', 'active').limit(1).maybeSingle();
  if (error) throw new Error('Impossible de vérifier les droits du compte.');
  // Audit final du 27/10 (PUB-01) : le sas sert aussi à tout compte qui a activé sa double authentification depuis
  // « Mon compte », que le proxy renvoie ici avant d'ouvrir l'espace. Le facteur se lit dans l'utilisateur vérifié par
  // getUser(), jamais dans la session du cookie (relecture du 28/10). Sans adhésion de supervision ni facteur, rien à
  // vérifier : retour aux espaces.
  const supervision = Boolean(adhesion);
  if (!supervision && !aUnFacteurVerifie(user)) redirect('/espaces');
  const params = await searchParams;
  return <main className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16">
    <div className="mb-10 flex items-center justify-between"><MarqueGerimmo tuile /><PurgerCopiesAutresComptes compteId={user.id} /><FormulaireDeconnexion className="lien-discret text-sm">Se déconnecter</FormulaireDeconnexion></div>
    {/* Le titre ne prétend plus qu'un code « est requis » quand la session est
        déjà vérifiée (audit 25/09, C24) : la carte dessous dit l'état réel. */}
    <p className="eyebrow">Protection du compte</p>
    <h1 className="mt-2 text-3xl font-semibold">Sécurité du compte</h1>
    <p className="mt-3 text-muted-foreground">{supervision
      ? 'L’accès de supervision donne accès aux organisations et aux données sensibles : il demande un code de votre application d’authentification en plus du mot de passe.'
      : 'Vous avez activé la double authentification : votre compte demande un code de votre application d’authentification en plus du mot de passe, à chaque connexion.'}</p>
    <FormulaireMfa suite={destinationApresMfa(typeof params.suite === 'string' ? params.suite : null)} />
    <p className="mt-7 text-sm text-muted-foreground">{supervision
      ? 'En cas de perte de l’application, demandez au responsable technique de réinitialiser la double authentification de votre compte, après vérification de votre identité.'
      : 'En cas de perte de l’application, déconnectez-vous puis écrivez-nous depuis le formulaire de contact de l’accueil : la double authentification de votre compte sera réinitialisée après vérification de votre identité.'} Le mot de passe seul ne permet pas de contourner cette protection.</p>
    <Link href="/confidentialite" className="mt-4 inline-block lien-discret text-xs">Confidentialité</Link>
  </main>;
}
