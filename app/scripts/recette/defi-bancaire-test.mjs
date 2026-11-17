// Étape manuelle facultative de la recette Stripe. Les deux liens sont chiffrés
// pour le poste de l'opérateur. Aucun identifiant client Gerimmo n'est utilisé.
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import Stripe from 'stripe';

const sens = ['accepter', 'refuser'];
const origineRetour = 'http://127.0.0.1:3487/retour-stripe-test';
const cle = process.env.GERIMMO_STRIPE_TEST_KEY;
const action = process.env.DEFI_ACTION;
const execution = action === 'preparer' ? process.env.GITHUB_RUN_ID : process.env.DEFI_EXECUTION;
const etiquette = 'gerimmo-controle-3ds-v1';

function chiffrer(objet, publique) {
  const cleOperateur = createPublicKey({key: Buffer.from(publique, 'base64'), format:'der', type:'spki'});
  if (cleOperateur.asymmetricKeyType !== 'x25519') throw Error('Clé publique de recette incorrecte.');
  const paire=generateKeyPairSync('x25519');
  const secret=diffieHellman({privateKey:paire.privateKey,publicKey:cleOperateur});
  const nonce=randomBytes(12);
  const aes=createCipheriv('aes-256-gcm',hkdfSync('sha256',secret,Buffer.from(execution),Buffer.from(etiquette),32),nonce);
  const chiffre=Buffer.concat([aes.update(JSON.stringify(objet),'utf8'),aes.final()]);
  return {version:1, execution, publique:paire.publicKey.export({format:'der',type:'spki'}).toString('base64'),
    nonce:nonce.toString('base64'), tag:aes.getAuthTag().toString('base64'), chiffre:chiffre.toString('base64')};
}

async function main(){
  if (!/^(sk|rk)_test_/.test(cle||'') || !/^\d{1,20}$/.test(execution||'') || !['preparer','verifier','clore'].includes(action))
    throw Error('Recette Stripe TEST et référence numérique obligatoires.');
  const stripe=new Stripe(cle,{maxNetworkRetries:1,timeout:18000});
  if(action==='preparer'){
    const publique=process.env.DEFI_CLE_PUBLIQUE||'';
    if(!/^[A-Za-z0-9+/=]{50,100}$/.test(publique))throw Error('Clé publique de remise requise.');
    chiffrer({},publique); // Refuser un destinataire illisible avant la création.
    const crees=[];
    try{
      const liens={};
      for(const choix of sens){
        const p=await stripe.paymentIntents.create({amount:100,currency:'eur',payment_method:'pm_card_threeDSecure2Required',
          payment_method_types:['card'],payment_method_options:{card:{request_three_d_secure:'challenge'}},
          capture_method:'manual',confirm:true,return_url:origineRetour,
          description:'Exercice bancaire Gerimmo TEST — '+choix,metadata:{recette:etiquette,execution,choix}},
          {idempotencyKey:etiquette+'-'+execution+'-'+choix});
        if(p.livemode)throw Error('Mode inattendu.');
        crees.push(p.id);
        if(p.status!=='requires_action' || p.next_action?.type!=='redirect_to_url')throw Error('Le défi interactif n’a pas été présenté.');
        const u=new URL(p.next_action.redirect_to_url.url);
        if(u.protocol!=='https:' || u.hostname!=='hooks.stripe.com')throw Error('Origine du défi Stripe non reconnue.');
        liens[choix]=u.href;
      }
      await writeFile(process.env.DEFI_DOSSIER+'/defis-chiffres.json',JSON.stringify(chiffrer(liens,publique)),{mode:0o600});
      console.log('Deux défis fictifs préparés. Aucun montant capturé.');
    }catch(err){
      for(const id of crees)await stripe.paymentIntents.cancel(id).catch(()=>{console.error('Clôture du cas fictif à vérifier.');});
      throw err;
    }
    return;
  }
  const trouves=await stripe.paymentIntents.search({query:"metadata['recette']:'"+etiquette+"' AND metadata['execution']:'"+execution+"'",limit:10,expand:['data.latest_charge']});
  if(trouves.has_more || trouves.data.length!==2)throw Error('La paire exacte de défis TEST est requise.');
  const bilan={execution,mode:'TEST',cas:{}};
  for(const choix of sens){
    const groupe=trouves.data.filter(p=>p.metadata.choix===choix);
    if(groupe.length!==1)throw Error('Paire de scénarios incomplète.');
    const p=groupe[0];
    if(p.livemode || p.amount!==100 || p.currency!=='eur' || p.capture_method!=='manual' || p.amount_received!==0) throw Error('Preuve de recette incohérente.');
    const carte=p.latest_charge?.payment_method_details?.card;
    const resultat=carte?.three_d_secure?.result||null;
    const erreur=p.last_payment_error?.code||null;
    const ok=choix==='accepter' ? p.status==='requires_capture' && resultat==='authenticated' :
      p.status==='requires_payment_method' && (erreur==='payment_intent_authentication_failure' || resultat==='failed');
    bilan.cas[choix]={statut:p.status,resultat3DS:resultat,erreur,centimesCaptures:p.amount_received,verifie:ok};
  }
  console.log(JSON.stringify(bilan));
  const complet=sens.every(c=>bilan.cas[c].verifie);
  if(complet || action==='clore'){
    for(const p of trouves.data)if(['requires_action','requires_payment_method','requires_capture'].includes(p.status))
      await stripe.paymentIntents.cancel(p.id,{},{idempotencyKey:'clore-'+etiquette+'-'+p.id});
  }
  if(!complet && action!=='clore')throw Error('Décision manuelle encore absente ou résultat bancaire inattendu.');
}
main().catch(e=>{console.error(e?.type?'Stripe TEST : '+(e.code||e.type):e.message);process.exitCode=1;});
