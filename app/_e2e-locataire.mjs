// E2E locataire — workflow incidents (recette 23/08), via l'API comme
// api-isolation.test.ts. Usage: node locataire-e2e.mjs <declarer|voir|contester|rouvrir> [incidentId] [message]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "C:/Users/Admin/Documents/vault/Gerimmo/app/.env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
const { error: eAuth } = await supabase.auth.signInWithPassword({
  email: "locataire.alpha@gerimmo-demo.fr",
  password: "Gerimmo-Demo-2026",
});
if (eAuth) { console.log("AUTH KO:", eAuth.message); process.exit(1); }
const org = "c3ac0aa4-448a-4b07-b75a-0aea817e4f47";
const [cmd, arg1, arg2] = process.argv.slice(2);

if (cmd === "declarer") {
  const { data, error } = await supabase.rpc("declarer_mon_incident", {
    p_org: org, p_categorie: "plomberie_joint",
    p_description: "TEST RECETTE 23/08 — fuite sous évier (dossier de test, à ignorer)",
    p_piece: "Cuisine", p_anciennete: "Depuis ce matin", p_urgence: "normale",
  });
  console.log("DECLARE:", error ? "KO " + error.message : "OK " + data);
} else if (cmd === "voir") {
  const { data, error } = await supabase.rpc("mes_incidents_locataire", { p_org: org });
  if (error) console.log("VOIR KO:", error.message);
  else console.log(JSON.stringify(data.map(i => ({
    id: i.id.slice(0, 8), numero: i.numero, etat: i.etat, imputation: i.imputation,
    justification: i.imputation_justification, conteste: i.imputation_contestee_le,
    declarant: i.est_declarant,
  })), null, 1));
} else if (cmd === "contester") {
  const { error } = await supabase.rpc("contester_imputation", {
    p_org: org, p_incident: arg1, p_message: arg2 ?? "TEST — je conteste, joint changé le mois dernier (à ignorer)",
  });
  console.log("CONTESTE:", error ? "KO " + error.message : "OK");
} else if (cmd === "rouvrir") {
  const { error } = await supabase.rpc("rouvrir_incident", {
    p_org: org, p_incident: arg1, p_motif: arg2 ?? "TEST — la fuite est revenue (à ignorer)",
  });
  console.log("ROUVRE:", error ? "KO " + error.message : "OK");
}
process.exit(0);
