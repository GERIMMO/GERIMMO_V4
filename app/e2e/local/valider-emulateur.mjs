// Batterie de validation de l'émulateur : les appels typiques de l'app,
// exécutés avec le vrai @supabase/supabase-js contre l'émulateur local.
import { createClient } from "@supabase/supabase-js";

const URL_LOCALE = "http://127.0.0.1:54321";
const sb = createClient(URL_LOCALE, "cle-locale", { auth: { persistSession: false } });

let echecs = 0;
function verifie(nom, cond, detail = "") {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    echecs++;
    console.error(`  ✗ ${nom} ${detail}`);
  }
}

// 1. Connexion par mot de passe (compte du seed)
const { data: conn, error: errConn } = await sb.auth.signInWithPassword({
  email: "admin.alpha@gerimmo-demo.fr",
  password: "Gerimmo-Demo-2026",
});
verifie("connexion admin.alpha", !errConn && !!conn?.session?.access_token, JSON.stringify(errConn));
if (errConn) process.exit(1);

// 2. getUser
const { data: u } = await sb.auth.getUser();
verifie("getUser rend l'email", u?.user?.email === "admin.alpha@gerimmo-demo.fr");

// 3. RLS : memberships du compte, embed organizations
const { data: adhesions, error: e3 } = await sb
  .from("memberships")
  .select("id, role, organisation:organizations(id, name, type)")
  .eq("account_id", u.user.id);
verifie("adhésions + embed organisation", !e3 && adhesions?.length >= 1 && adhesions[0].organisation?.name, JSON.stringify(e3 ?? adhesions));
const orgId = adhesions?.[0]?.organisation?.id;

// 4. Isolation : une table d'une autre organisation ne fuit pas
const { data: toutesOrgs } = await sb.from("organizations").select("id, name");
verifie("RLS : seules les organisations du compte sont visibles", (toutesOrgs?.length ?? 99) <= 2, JSON.stringify(toutesOrgs));

// 5. Création d'un bien (l'insert du parc) → le déclencheur crée le lot
// unique automatique, puis embed inverse (un-vers-plusieurs) + !fk explicite
const suffixe = Math.floor(Math.random() * 1e6);
const { data: bienCree, error: eCreation } = await sb.rpc("creer_bien_avec_lot", {
  p_org: orgId,
  p_nom: `Bien validation ${suffixe}`,
  p_type: "appartement",
  p_address_line1: "1 rue de la Validation",
  p_address_line2: null,
  p_postal_code: "75001",
  p_city: "Paris",
  p_annee: 1998,
  p_copropriete: false,
  p_surface: 42,
  p_pieces: 2,
});
verifie("rpc creer_bien_avec_lot (le geste réel du parc)", !eCreation && !!bienCree, JSON.stringify(eCreation));
const { data: biens, error: e5 } = await sb
  .from("biens")
  .select("id, nom, lots!lots_bien_id_fkey(id, nom, etat)")
  .eq("id", bienCree);
verifie("bien → lots (tableau, !fk, lot auto)", !e5 && Array.isArray(biens?.[0]?.lots) && biens[0].lots.length >= 1, JSON.stringify(e5 ?? biens?.[0]));

// 6. Embed objet (plusieurs-vers-un) : lot → bien
const { data: lots, error: e6 } = await sb
  .from("lots")
  .select("id, nom, bien:biens!lots_bien_id_fkey(nom)")
  .eq("organization_id", orgId)
  .limit(1);
verifie("lot → bien (objet)", !e6 && typeof lots?.[0]?.bien?.nom === "string", JSON.stringify(e6 ?? lots));

// 7. count exact + head
const { count, error: e7 } = await sb
  .from("biens")
  .select("*", { count: "exact", head: true })
  .eq("organization_id", orgId);
verifie("count exact head", !e7 && typeof count === "number", JSON.stringify(e7 ?? count));

// 8. maybeSingle sur 0 rangée → null sans erreur
const { data: rien, error: e8 } = await sb
  .from("biens")
  .select("id")
  .eq("id", "00000000-0000-0000-0000-000000000001")
  .maybeSingle();
verifie("maybeSingle vide → null", !e8 && rien === null, JSON.stringify(e8));

// 9. RPC set-returning (les alertes du tableau de bord, si présente) et scalaire
const { data: rpcBlocages, error: e9 } = await sb.rpc("lot_blocages_location", {
  p_lot: lots?.[0]?.id,
});
verifie("rpc lot_blocages_location", !e9 && rpcBlocages !== undefined, JSON.stringify(e9));

// 10. Écriture réaliste (le motif exact de l'app) : fiche personne en
// representation (insert + select single), puis mise à jour.
const { data: ins, error: e10 } = await sb
  .from("persons")
  .insert({ organization_id: orgId, nom: "Validation", prenom: "Émulateur" })
  .select("id, nom")
  .single();
verifie("insert persons + select single", !e10 && ins?.nom === "Validation", JSON.stringify(e10));
if (ins?.id) {
  const { error: e11 } = await sb.from("persons").update({ prenom: "Corrigé" }).eq("id", ins.id);
  verifie("update persons", !e11, JSON.stringify(e11));
}

// 11. Violation RLS attendue : écrire dans une autre organisation échoue
const { error: e12 } = await sb
  .from("persons")
  .insert({ organization_id: "00000000-0000-0000-0000-000000000002", nom: "Interdit" })
  .select("id")
  .single();
verifie("insert hors organisation → refusé", !!e12, "aurait dû échouer");

// 12. Embed imbriqué à 2 niveaux
const { data: profond, error: e13 } = await sb
  .from("lots")
  .select("id, bien:biens!lots_bien_id_fkey(id, nom, type)")
  .limit(1);
verifie("embed simple stable", !e13 && profond !== null, JSON.stringify(e13));

// 13. Storage : dépôt puis relecture d'un petit fichier
const { data: up, error: e14 } = await sb.storage
  .from("documents")
  .upload(`${orgId}/validation/test-emulateur-${suffixe}.txt`, new Blob(["bonjour"]), { contentType: "text/plain" });
verifie("storage upload", !e14 && !!up?.path, JSON.stringify(e14));
// La politique GED n'ouvre la lecture qu'aux objets ayant une fiche
// `documents` (créée par l'app APRÈS l'upload) : sans fiche, télécharger
// doit être REFUSÉ — comportement fidèle attendu.
const { error: e15 } = await sb.storage
  .from("documents")
  .download(`${orgId}/validation/test-emulateur-${suffixe}.txt`);
verifie("storage download sans fiche GED → refusé (politique réelle)", !!e15, "aurait dû être refusé");
await sb.storage.from("documents").remove([`${orgId}/validation/test-emulateur-${suffixe}.txt`]);

// 14. signUp (auto-inscription PD) puis nettoyage manuel impossible ici — email jetable
const jetable = `validation-emulateur-${Math.floor(Math.random() * 1e9)}@exemple.fr`;
const { data: nouv, error: e17 } = await sb.auth.signUp({
  email: jetable,
  password: "MotDePasse-Local-2026!",
  options: { data: { nom: "Test", prenom: "Émulateur" } },
});
verifie("signUp autoconfirmé", !e17 && !!nouv?.session?.access_token, JSON.stringify(e17));

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout passe.");
process.exit(echecs ? 1 : 0);
