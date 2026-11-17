// Exécution depuis le banc local avec les suites du candidat. Les traces sont désactivées,
// car les URL de confirmation contiennent des jetons de recette à usage unique.
const path = require('node:path');
const fs = require('node:fs');
const app = path.resolve(__dirname,'../../../app');
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3483';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw Error('Banc local requis');
fs.mkdirSync(path.join(__dirname,'preuves'),{recursive:true});
module.exports={
 testDir:path.join(app,'e2e'),testMatch:['outils.spec.ts','agences.spec.ts','lot2-pilote.spec.ts','lot2-artisan.spec.ts'],
 outputDir:path.join(__dirname,'preuves/parcours'),timeout:120000,expect:{timeout:15000},workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:path.join(__dirname,'preuves/parcours-publics.json')}]],
 use:{baseURL,locale:'fr-FR',timezoneId:'Europe/Paris',trace:'off',screenshot:'off'},
 projects:[390,768,1440].map(width=>({name:String(width),use:{viewport:{width,height:width===1440?960:844},hasTouch:width!==1440}})),
};
