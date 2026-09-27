'use client';
import {useActionState} from 'react';
import {demanderCorrection,type RetourMission} from '@/app/actions/equipes';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
export function AtelierQualite({preparation,demonstration,active}:{preparation:boolean;demonstration:boolean;active:boolean}){
 const [etat,action]=useActionState<RetourMission,FormData>(demanderCorrection,{});
 const connecte=preparation&&demonstration&&active;
 return <section className="loc-carte"><div className="entete-carte"><h2 className="text-xl font-semibold">Équipe qualité et corrections</h2></div><p className="mesure-lecture text-sm text-muted-foreground">L’atelier prépare une proposition de correction de l’interface dans une copie séparée. Les accès, la comptabilité, les paiements et la base ne sont pas modifiés par cet atelier. La proposition doit réussir les contrôles et recevoir une validation avant publication.</p>
 {/* Les jetons de la charte (nuit du 25/09) : plus de bleu Tailwind hors palette. */}
 <dl className="mt-5 grid gap-4 sm:grid-cols-3" aria-label="Préparation de l’atelier">
  <div className="rounded-xl bg-[var(--marque-clair)] p-4"><dt className="text-sm">Préparer les corrections</dt><dd className="mt-1 font-semibold">{preparation?'Accès enregistré':'Connexion à terminer'}</dd></div>
  <div className="rounded-xl bg-[var(--marque-clair)] p-4"><dt className="text-sm">Vérifier les démonstrations</dt><dd className="mt-1 font-semibold">{demonstration?'Accès enregistré':'Connexion à terminer'}</dd></div>
  <div className="rounded-xl bg-[var(--marque-clair)] p-4"><dt className="text-sm">Lancement de l’atelier</dt><dd className="mt-1 font-semibold">{active?'Autorisé sur demande':'En pause'}</dd></div>
 </dl><p className="mesure-lecture mt-4 text-sm text-muted-foreground">{connecte?'Les accès sont enregistrés. Un premier essai complet doit encore confirmer la préparation et la démonstration.':'La gestion quotidienne des utilisateurs continue. Les corrections attendent les connexions nécessaires et l’activation de l’atelier.'} L’accès et le crédit du service d’IA se vérifient lors de l’essai ; ils ne sont pas confirmés par cet écran.</p>
 <form action={action} className="mt-4 space-y-3"><label className="block text-sm">Correction souhaitée, sans donnée personnelle<textarea name="demande" required minLength={10} maxLength={4000} className="mt-1 min-h-24 w-full rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-3"/></label><BoutonEnvoi disabled={!connecte}>Préparer une proposition</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form><a href="/admin/autonomie#ameliorations" className="lien-discret mt-4 mr-4 inline-block text-sm">Suivre les corrections dans Gerimmo →</a><a className="lien-discret mt-4 inline-block text-sm" href="https://github.com/GERIMMO/GERIMMO_V4/actions/workflows/atelier-code.yml" target="_blank" rel="noreferrer">Voir les préparations et leur résultat</a></section>;
}
