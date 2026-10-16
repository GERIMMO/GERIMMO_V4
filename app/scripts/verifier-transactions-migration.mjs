import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Garde syntaxique défensive, pas un parseur SQL arbitraire : la revue des migrations reste obligatoire.
 * Ignore les corps SQL cités et commentaires ; la session impose standard_conforming_strings=on.
 * Les SET/RESET explicites du lot ne peuvent pas changer ce mode de lecture. */
export function transactionsInterdites(source) {
  let nu='', i=0;
  while(i<source.length){
    if(source.startsWith('--',i)){const fin=source.indexOf('\n',i);i=fin<0?source.length:fin;nu+=' ';continue;}
    if(source.startsWith('/*',i)){
      let profondeur=1;i+=2;
      while(i<source.length&&profondeur){if(source.startsWith('/*',i)){profondeur++;i+=2;}else if(source.startsWith('*/',i)){profondeur--;i+=2;}else i++;}
      if(profondeur)throw new Error('Commentaire SQL incomplet.');nu+=' ';continue;
    }
    // Un dollar après un caractère d'identifiant appartient à cet identifiant.
    const dansIdentifiant=/[A-Za-z_0-9$\u0080-\uffff]/.test(source[i-1]??'');
    const tag=!dansIdentifiant && source.slice(i).match(/^\$(?:[A-Za-z_\u0080-\uffff][A-Za-z_0-9\u0080-\uffff]*)?\$/)?.[0];
    if(tag){const fin=source.indexOf(tag,i+tag.length);if(fin<0)throw new Error('Corps SQL cité incomplet.');i=fin+tag.length;nu+=' contenu_cite ';continue;}
    if(source[i]==="'"||source[i]==='"'){
      // Seul le préfixe E explicite donne un sens d'échappement à la barre oblique.
      const echappee=source[i]==="'" && /[eE]/.test(source[i-1]??'') && !/[A-Za-z_0-9$\u0080-\uffff]/.test(source[i-2]??'');
      const quote=source[i++],debut=i;let ferme=false;
      while(i<source.length){if(source[i]===quote){if(source[i+1]===quote){i+=2;continue;}i++;ferme=true;break;}if(source[i]==='\\'&&echappee){i+=2;continue;}i++;}
      if(!ferme)throw new Error('Chaîne SQL incomplète.');
      const reglage=quote==='\"'&&source.slice(debut,i-1).toLowerCase()==='standard_conforming_strings';
      nu+=reglage?' standard_conforming_strings ':' contenu_cite ';continue;
    }
    nu+=source[i++];
  }
  return nu.split(';').map(s=>s.trim()).filter(s=>/^(?:begin\b|start\s+transaction\b|commit\b|end\b|rollback\b|abort\b|prepare\s+transaction\b|set\s+(?:(?:local|session)\s+)?standard_conforming_strings\b|reset\s+(?:standard_conforming_strings|all)\b)/i.test(s));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length<3)throw new Error('Nommez les migrations à contrôler.');
  for(const fichier of process.argv.slice(2)){
   if(transactionsInterdites(readFileSync(fichier,'utf8')).length)throw new Error(`${fichier} : transaction interne ou changement du mode des chaînes interdit. Le chantier contrôle seul la simulation et la validation.`);
  }
 }catch(e){console.error(e instanceof Error?e.message:'Contrôle impossible.');process.exitCode=1;}
}
