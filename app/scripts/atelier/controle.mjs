export function validerProposition(proposition){
 if(!proposition||typeof proposition.resume!=='string'||proposition.resume.length>4000||!Array.isArray(proposition.fichiers)||!proposition.fichiers.length||proposition.fichiers.length>5)throw new Error('Proposition inexploitable');
 const vus=new Set();let taille=0;
 for(const f of proposition.fichiers){
  if(typeof f.chemin!=='string'||!/^app\/src\/components\/[a-zA-Z0-9_/-]+\.(tsx|ts|css)$/.test(f.chemin)||f.chemin.includes('..')||vus.has(f.chemin)||typeof f.contenu!=='string'||f.contenu.length>50000)throw new Error('Modification hors périmètre');
  vus.add(f.chemin);taille+=f.contenu.length;
 }
 if(taille>100000)throw new Error('Proposition trop volumineuse');
 return proposition;
}
