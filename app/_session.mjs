// Ouvre une session par jeton d'API sur un compte de recette et rend le cookie
// attendu par @supabase/ssr. Aucun mot de passe n'est saisi dans un formulaire.
const REF = "caalwwgcauvxfbsdpuuu";
const CLE = "sb_publishable_OwYdb7f2wGZ1gqFnq9RIJQ_SydSao8A";
const compte = process.argv[2];
const r = await fetch(`https://${REF}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: CLE, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `tahir.brahim.pro+${compte}@gmail.com`, password: "Recette-2026!" }),
});
const s = await r.json();
if (!s.access_token) { console.error("échec :", JSON.stringify(s).slice(0, 200)); process.exit(1); }
const session = {
  access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in,
  expires_at: Math.floor(Date.now() / 1000) + s.expires_in, token_type: "bearer", user: s.user,
};
const valeur = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
// Le cookie est découpé si nécessaire (limite ~3180 octets par morceau)
const NOM = `sb-${REF}-auth-token`;
const T = 3180;
const morceaux = [];
for (let i = 0; i < valeur.length; i += T) morceaux.push(valeur.slice(i, i + T));
const cookies = morceaux.length === 1
  ? [[NOM, valeur]]
  : morceaux.map((m, i) => [`${NOM}.${i}`, m]);
console.log(JSON.stringify({ compte, email: s.user.email, cookies }));
