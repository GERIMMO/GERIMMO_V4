const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const baseURL='http://localhost:3483';
module.exports={testDir:path.join(root,'app/e2e'),testMatch:'lot2-invitations.spec.ts',outputDir:path.join(__dirname,'preuves/invitations'),timeout:480000,expect:{timeout:45000},workers:1,retries:0,reporter:[['list'],['json',{outputFile:path.join(__dirname,'preuves/invitations-locataire.json')}]],use:{baseURL,locale:'fr-FR',timezoneId:'Europe/Paris',trace:'off',screenshot:'off',launchOptions:{args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']}},projects:[390,768,1440].map(width=>({name:String(width),use:{viewport:{width,height:width===1440?960:844},hasTouch:width!==1440}}))};
