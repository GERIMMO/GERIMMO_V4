import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RappelLoyer } from "@/lib/rappels-loyers";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()}),unstable_rethrow:vi.fn()}));
vi.mock("@/app/actions/reception-loyer",()=>({declarerReceptionLoyer:vi.fn(),envoyerRelanceReception:vi.fn()}));
vi.mock("@/components/bouton-generer-document",()=>({BoutonGenererDocument:({code,options,libelle}:{code:string;options?:Record<string,string>;libelle:string})=>createElement("button",{"data-modele":code,"data-delai":options?.delai},libelle)}));
import { RappelsLoyersInteractifs } from "@/components/rappels-loyers-interactifs";
import { RappelsLoyers } from "@/components/rappels-loyers";

const ligne:RappelLoyer={appel_id:"appel",bail_id:"bail",lot_nom:"Appartement",locataire:"Camille",periode:"2026-10-01",date_echeance:"2026-10-05",montant_du:800,montant_couvert:200,non_recu_signale_le:null,historique_relances_disponible:true};
const rendre=(patch:Partial<RappelLoyer>={},lectureSeule=false)=>renderToStaticMarkup(createElement(RappelsLoyersInteractifs,{orgId:"org",aujourdHui:"2026-10-26",dus:[{...ligne,...patch}],prochaine:null,totalEcheancesDues:1,lectureSeule}));

describe("rappels de loyers : étapes de la relance",()=>{
  it("le composant serveur expose le titre et les actions en mode page, tout en gardant le mode fenêtre par défaut", async () => {
    const requete = (lignes: unknown[]) => {
      const q = { order: () => q, eq: () => q, gte: () => q, or: () => q, limit: () => q,
        range: async () => ({ data: lignes, error: null }),
        maybeSingle: async () => ({ data: lignes[0] ?? null, error: null }) };
      return q;
    };
    const db = { rpc: () => requete([ligne]), from: () => ({ select: () => requete([]) }) };
    const page = renderToStaticMarkup(await RappelsLoyers({ supabase: db as never, orgId: "org", dansFenetre: false }));
    expect(page).toContain('<h2 id="reception-loyers-titre">Avez-vous reçu vos loyers ?</h2>');
    expect(page).toContain("J’ai reçu le reste");
    expect(page).toContain("Reçu en partie");
    expect(page).toContain("Gérer la relance et le recommandé");
    expect(page).toContain('href="/espace/org/baux/bail#relances"');
    const fenetre = renderToStaticMarkup(await RappelsLoyers({ supabase: db as never, orgId: "org" }));
    expect(fenetre).toContain('<h2 id="reception-loyers-titre" class="sr-only">');
  });
  it("prépare un recommandé avec le délai exigé par le modèle",()=>{
    const html=rendre();expect(html).toContain('data-modele="mise_en_demeure" data-delai="15"');expect(html).toContain("Délai de règlement (jours)");expect(html).toContain('name="reste_attendu" value="600.00"');
  });
  it("confirme le loyer à échéance sans proposer une procédure de retard le même jour",()=>{
    const html=rendre({date_echeance:"2026-10-26"});expect(html).toContain("J’ai reçu le reste");expect(html).toContain("disponibles dès demain");expect(html).not.toContain("Envoyer la relance par e-mail");expect(html).not.toContain('data-modele="mise_en_demeure"');
  });
  it.each(["relance_1","relance_2","mise_en_demeure"])("respecte le suivi %s déjà ouvert dans le bail",niveau=>{
    const html=rendre({derniere_relance:{niveau,date_envoi:"2026-10-12"}});expect(html).toContain("a été enregistrée le");expect(html).not.toContain("Envoyer la relance par e-mail");expect(html).not.toContain('data-modele="relance_simple"');
    if(niveau==="mise_en_demeure")expect(html).not.toContain('data-modele="mise_en_demeure"');
  });
  it("laisse consulter le bail quand l'historique est indisponible",()=>{
    const html=rendre({historique_relances_disponible:false});expect(html).toContain("n’a pas pu être vérifié");expect(html).toContain("Suivre les relances");expect(html).not.toContain("Envoyer la relance par e-mail");expect(html).not.toContain('data-modele="mise_en_demeure"');
  });
  it("annonce la dette échue totale du bail avant l'envoi de la relance (audit du 27/10, NEW-01)",()=>{
    const html=rendre({dette_bail:{echeances:2,reste:1400,termesEchus:2,resteEchu:1400}});
    expect(html).toContain(`600,00\u00a0€ restant à recevoir, 1\u202f400,00\u00a0€ échus au total sur le bail`);
    expect(rendre({dette_bail:{echeances:1,reste:600,termesEchus:1,resteEchu:600}})).not.toContain("au total sur le bail");
  });
  it("montre l'arriéré du bail sur sa ligne et le marque prioritaire à deux termes échus (audit du 27/10, LAT-03)",()=>{
    const html=rendre({dette_bail:{echeances:2,reste:1400,termesEchus:2,resteEchu:1400}});
    expect(html).toContain("1 autre mois à recevoir sur ce bail");expect(html).toContain("1\u202f400,00\u00a0€ au total");expect(html).toContain(">Prioritaire<");
    const veille=rendre({dette_bail:{echeances:2,reste:1400,termesEchus:1,resteEchu:600}});
    expect(veille).toContain("1 autre mois à recevoir");expect(veille).not.toContain(">Prioritaire<");
    const seul=rendre({dette_bail:{echeances:1,reste:600,termesEchus:1,resteEchu:600}});
    expect(seul).not.toContain("autre mois");expect(seul).not.toContain("au total");expect(seul).not.toContain(">Prioritaire<");
  });
  it("ne rend aucun geste d'écriture dans une traversée en lecture seule",()=>{
    const html=rendre({},true);expect(html).not.toContain("<button");expect(html).not.toContain("Gérer la relance");
  });
});
