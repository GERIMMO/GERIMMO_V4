import { assurerProposition } from "./proposition-github.mjs";
import {readFile} from 'node:fs/promises';import {validerProposition} from './controle.mjs';
const e=process.env;
if(e.GITHUB_REF!=='refs/heads/main'||e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GERIMMO_CODEX_ENABLED!=='true'||!e.GERIMMO_CODE_WRITER_TOKEN)throw new Error('Atelier non activé');
if(!/^[0-9a-f-]{36}$/.test(e.PROPOSITION_ID??'')||e.GITHUB_REPOSITORY!=='GERIMMO/GERIMMO_V4')throw new Error('Destination refusée');
const texte=await readFile('correction/proposition.json','utf8');if(Buffer.byteLength(texte)>150000)throw new Error('Proposition trop volumineuse');const p=validerProposition(JSON.parse(texte));
async function gh(path,body,options={}){const r=await fetch(`https://api.github.com/repos/GERIMMO/GERIMMO_V4/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${e.GERIMMO_CODE_WRITER_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});if(options.absent && r.status===404)return null;if(!r.ok)throw new Error(`GitHub n’a pas confirmé l’opération (${r.status})`);return r.json();}
const pr = await assurerProposition(gh, { id: e.PROPOSITION_ID, base: e.BASE_SHA, fichiers: p.fichiers, resume: p.resume });
console.log(`Proposition conservée : ${pr.html_url}`);
