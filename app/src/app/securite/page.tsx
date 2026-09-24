import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { seDeconnecter } from '@/app/actions/auth';
import { MarqueGerimmo } from '@/components/marque-gerimmo';
import { FormulaireMfa } from './formulaire-mfa';
import { destinationApresMfa } from '@/lib/mfa';

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
  if (!adhesion) redirect('/espaces');
  const params = await searchParams;
  return <main className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16">
    <div className="mb-10 flex items-center justify-between"><MarqueGerimmo /><form action={seDeconnecter}><button type="submit" className="lien-discret text-sm">Se déconnecter</button></form></div>
    <p className="eyebrow">Protection du compte</p>
    <h1 className="mt-2 text-3xl font-semibold">Une seconde vérification</h1>
    <p className="mt-3 text-muted-foreground">L’accès de supervision donne accès aux organisations et aux données sensibles. Un code de votre application d’authentification est requis en plus du mot de passe.</p>
    <FormulaireMfa suite={destinationApresMfa(typeof params.suite === 'string' ? params.suite : null)} />
    <p className="mt-7 text-sm text-muted-foreground">En cas de perte de l’application, le propriétaire du projet doit réinitialiser le facteur dans la gestion des utilisateurs Supabase, après vérification de votre identité. Le mot de passe seul ne permet pas de contourner cette protection.</p>
    <Link href="/confidentialite" className="mt-4 inline-block lien-discret text-xs">Confidentialité</Link>
  </main>;
}
