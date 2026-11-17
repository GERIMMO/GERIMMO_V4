// Remise des deux défis Stripe TEST à l'opérateur du Mac. Le dossier privé reste hors du dépôt.
import { createDecipheriv, createPublicKey, createPrivateKey, diffieHellman, generateKeyPairSync, hkdfSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const [action,dossier,archive] = process.argv.slice(2);
if(!path.isAbsolute(dossier) || !['preparer','ouvrir'].includes(action))throw Error('Choisir une opération et un dossier privé absolu.');
await mkdir(dossier, {mode:0o700,recursive:true});
const f=n=>path.join(dossier,n);
if(action==='preparer'){
  const paire=generateKeyPairSync('x25519');
  await writeFile(f('operateur.pem'),paire.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600,flag:'wx'});
  await writeFile(f('publique.txt'),paire.publicKey.export({format:'der',type:'spki'}).toString('base64'),{mode:0o600,flag:'wx'});
}else{
  const d=JSON.parse(await readFile(archive,'utf8'));
  if(d.version!==1 || !/^\d{1,20}$/.test(d.execution))throw Error('Remise non reconnue.');
  const priv=createPrivateKey(await readFile(f('operateur.pem')));
  const pub=createPublicKey({key:Buffer.from(d.publique,'base64'),format:'der',type:'spki'});
  const secret=diffieHellman({privateKey:priv,publicKey:pub});
  const aes=createDecipheriv('aes-256-gcm',hkdfSync('sha256',secret,Buffer.from(d.execution),Buffer.from('gerimmo-controle-3ds-v1'),32),Buffer.from(d.nonce,'base64'));
  aes.setAuthTag(Buffer.from(d.tag,'base64'));
  const liens=JSON.parse(Buffer.concat([aes.update(Buffer.from(d.chiffre,'base64')),aes.final()]).toString('utf8'));
  const bouton=(cle,nom)=>{
    const u=new URL(liens[cle]);
    if(u.origin!=='https://hooks.stripe.com')throw Error('Hôte du simulateur inattendu.');
    const attr=u.href.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    return '<p><a target="_blank" rel="noreferrer" href="'+attr+'">'+nom+'</a></p>';
  };
  const html='<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gerimmo · test bancaire</title><main style="max-width:38rem;margin:3rem auto;padding:1rem;font:18px system-ui;line-height:1.6"><h1>Vérification bancaire fictive</h1><p>Ces deux opérations à 1 € utilisent la carte de test fournie par Stripe. Aucun argent réel ni saisie de carte.</p>'+bouton('accepter','1. Ouvrir le premier défi et choisir « Complete »')+bouton('refuser','2. Ouvrir le second défi et choisir « Fail »')+'<p>Après les deux décisions, tu peux fermer cette page.</p></main></html>';
  await writeFile(f('Defis-Stripe-TEST.html'),html,{mode:0o600});
}
