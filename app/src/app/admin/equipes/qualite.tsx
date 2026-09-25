'use client';
import {useActionState} from 'react';
import {demanderCorrection,type RetourMission} from '@/app/actions/equipes';
import {BoutonEnvoi} from '@/components/ui/bouton-envoi';
export function AtelierQualite({preparation,demonstration,active}:{preparation:boolean;demonstration:boolean;active:boolean}){
 const [etat,action]=useActionState<RetourMission,FormData>(demanderCorrection,{});
 const connecte=preparation&&demonstration&&active;
 return <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-semibold">Équipe qualité et corrections</h2><p className="mt-2 text-sm">L’atelier prépare une proposition de correction de l’interface dans une copie séparée. Les accès, la comptabilité, les paiements et la base ne sont pas modifiés par cet atelier. La proposition doit réussir les contrôles et recevoir une validation avant publication.</p>
 <dl className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Préparation de l’atelier">
  <div className="rounded-xl bg-blue-50 p-3"><dt className="text-sm">Préparer les corrections</dt><dd className="mt-1 font-semibold">{preparation?'Accès enregistré':'Connexion à terminer'}</dd></div>
  <div className="rounded-xl bg-blue-50 p-3"><dt className="text-sm">Vérifier les démonstrations</dt><dd className="mt-1 font-semibold">{demonstration?'Accès enregistré':'Connexion à terminer'}</dd></div>
  <div className="rounded-xl bg-blue-50 p-3"><dt className="text-sm">Lancement de l’atelier</dt><dd className="mt-1 font-semibold">{active?'Autorisé sur demande':'En pause'}</dd></div>
 </dl><p className="mt-3 text-sm text-muted-foreground">{connecte?'Les accès sont enregistrés. Un premier essai complet doit encore confirmer la préparation et la démonstration.':'La gestion quotidienne des utilisateurs continue. Les corrections attendent les connexions nécessaires et l’activation de l’atelier.'} L’accès et le crédit du service d’IA se vérifient lors de l’essai ; ils ne sont pas confirmés par cet écran.</p>
 <form action={action} className="mt-3 space-y-3"><label className="block text-sm">Correction souhaitée, sans donnée personnelle<textarea name="demande" required minLength={10} maxLength={4000} className="mt-1 min-h-24 w-full rounded-lg border p-3"/></label><BoutonEnvoi disabled={!connecte}>Préparer une proposition</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status">{etat.succes}</p>}</form><a href="/admin/autonomie#ameliorations" className="mt-3 mr-4 inline-block text-sm underline">Suivre les corrections dans Gerimmo</a><a className="mt-3 inline-block text-sm underline" href="https://github.com/GERIMMO/GERIMMO_V4/actions/workflows/atelier-code.yml" target="_blank" rel="noreferrer">Voir les préparations et leur résultat</a></section>;
}
