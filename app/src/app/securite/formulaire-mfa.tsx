'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { codeTotpValide, destinationApresMfa } from '@/lib/mfa';

type Facteur = { id: string; friendly_name?: string };
type Inscription = { id: string; qr: string; secret: string };

export function FormulaireMfa({ suite }: { suite: string }) {
  const [client] = useState(() => createClient());
  const [facteurs, setFacteurs] = useState<Facteur[]>([]);
  const [facteurId, setFacteurId] = useState('');
  const [inscription, setInscription] = useState<Inscription | null>(null);
  const [code, setCode] = useState('');
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [verifie, setVerifie] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const [liste, niveau] = await Promise.all([client.auth.mfa.listFactors(), client.auth.mfa.getAuthenticatorAssuranceLevel()]);
        if (!actif) return;
        if (liste.error || niveau.error) { setErreur('La protection du compte n’a pas pu être chargée. Rechargez la page.'); return; }
        setFacteurs(liste.data.totp); setFacteurId(liste.data.totp[0]?.id ?? '');
        setVerifie(niveau.data.currentLevel === 'aal2');
      } catch { if (actif) setErreur('Connexion interrompue. Rechargez la page pour réessayer.'); }
      finally { if (actif) setChargement(false); }
    })();
    return () => { actif = false; };
  }, [client]);

  async function configurer() {
    if (enCours) return;
    setEnCours(true); setErreur('');
    try {
      // Une configuration interrompue ne doit pas accumuler des facteurs
      // inutilisables. Seuls nos facteurs TOTP non vérifiés sont remplacés,
      // après le clic explicite de l'utilisateur, jamais un facteur actif.
      const liste = await client.auth.mfa.listFactors();
      if (liste.error) { setErreur('Impossible de vérifier les configurations en attente. Rechargez la page.'); return; }
      for (const f of liste.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified' && f.friendly_name?.startsWith('Application Gerimmo '))) {
        const annulation = await client.auth.mfa.unenroll({ factorId: f.id });
        if (annulation.error) { setErreur('La configuration précédente n’a pas pu être remplacée. Rechargez la page.'); return; }
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Application Gerimmo ${new Date().toISOString().slice(0, 19)}` });
      if (error) { setErreur('Le service de protection est indisponible. Réessayez dans quelques instants.'); return; }
      setInscription({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }); setFacteurId(data.id); setCode('');
    } catch { setErreur('Connexion interrompue. Rechargez la page avant de recommencer.'); }
    finally { setEnCours(false); }
  }

  async function verifier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enCours || !facteurId) return;
    if (!codeTotpValide(code)) { setErreur('Saisissez les six chiffres affichés dans votre application.'); return; }
    setEnCours(true); setErreur('');
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId: facteurId, code });
      if (error) { setErreur('Ce code est incorrect ou a expiré. Utilisez le code actuel de votre application.'); setCode(''); return; }
      // Le SDK a renouvelé les cookies avec une session AAL2. Une navigation
      // complète évite de réutiliser une page mise en cache avant vérification.
      setInscription(null); setCode(''); setVerifie(true);
      window.location.assign(destinationApresMfa(suite));
    } catch { setErreur('La vérification n’a pas abouti. Vérifiez votre connexion et réessayez.'); }
    finally { setEnCours(false); }
  }

  async function annulerConfiguration() {
    if (!inscription || enCours) return;
    setEnCours(true); setErreur('');
    try {
      const { error } = await client.auth.mfa.unenroll({ factorId: inscription.id });
      if (error) { setErreur('La configuration n’a pas pu être annulée. Rechargez la page.'); return; }
      setInscription(null); setFacteurId(facteurs[0]?.id ?? ''); setCode('');
    } catch { setErreur('Connexion interrompue. Rechargez la page.'); }
    finally { setEnCours(false); }
  }

  return <section className="mt-7 space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7" aria-busy={chargement || enCours}>
    {chargement ? <p role="status">Vérification de la protection…</p> : verifie ? <>
      <h2 className="text-lg font-semibold">Votre session est protégée</h2>
      <p className="text-sm text-muted-foreground">La double authentification a été vérifiée pour cette session.</p>
      <Button onClick={() => window.location.assign(destinationApresMfa(suite))}>Continuer vers mes espaces</Button>
    </> : <>
      {inscription ? <>
        <h2 className="text-lg font-semibold">Ajoutez Gerimmo à votre application</h2>
        <p className="text-sm">Scannez ce QR code avec une application d’authentification, puis saisissez son code à six chiffres.</p>
        {/* QR fourni par Supabase Auth : rendu comme image, jamais comme HTML. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={inscription.qr} alt="QR code de configuration de votre application d’authentification" width={220} height={220} className="mx-auto rounded-md bg-white p-2" />
        <details className="text-sm"><summary className="cursor-pointer lien-discret">Saisir une clé à la place du QR code</summary><p className="mt-2 break-all rounded bg-muted p-3 font-mono select-all">{inscription.secret}</p><p className="mt-2 text-muted-foreground">Conservez cette clé à l’abri des regards. Elle permet de générer vos codes.</p></details>
      </> : facteurs.length ? <><h2 className="text-lg font-semibold">Entrez le code de votre application</h2><p className="text-sm text-muted-foreground">Ouvrez l’application utilisée lors de la configuration du compte.</p></> : <>
        <h2 className="text-lg font-semibold">Configurer la double authentification</h2>
        <p className="text-sm text-muted-foreground">Cette étape est nécessaire pour ouvrir la supervision. Elle se termine après validation d’un premier code.</p>
        <Button type="button" onClick={configurer} disabled={enCours || Boolean(erreur)}>{enCours ? 'Préparation…' : 'Configurer mon application'}</Button>
      </>}
      {(inscription || facteurs.length > 0) && <form onSubmit={verifier} className="space-y-4">
        {!inscription && facteurs.length > 1 && <div className="space-y-2"><Label htmlFor="mfa-facteur">Application</Label><select id="mfa-facteur" value={facteurId} onChange={e => { setFacteurId(e.target.value); setCode(''); }} className="w-full rounded border border-input bg-background p-2">{facteurs.map((f,i) => <option key={f.id} value={f.id}>{f.friendly_name || `Application ${i+1}`}</option>)}</select></div>}
        <div className="space-y-2"><Label htmlFor="mfa-code">Code à six chiffres</Label><Input id="mfa-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0,6))} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required className="text-center text-xl tracking-widest" disabled={enCours} /></div>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={enCours || !codeTotpValide(code)}>{enCours ? 'Vérification…' : inscription ? 'Activer et continuer' : 'Vérifier et continuer'}</Button>{inscription && <Button type="button" variant="outline" onClick={annulerConfiguration} disabled={enCours}>Annuler la configuration</Button>}</div>
      </form>}
    </>}
    {erreur && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{erreur}</p><Button type="button" variant="ghost" onClick={() => window.location.reload()} disabled={enCours}>Recharger la protection</Button></div>}
  </section>;
}
