import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envoyerSurFacebook, retrouverPostFacebook, RefusFacebookCertain, messageMetaLisible, texteFacebook } from "@/lib/facebook";

describe("publication Facebook Gerimmo", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app"));

  it("publie avec la voix de Gerimmo et le lien canonique", () => {
    const texte = texteFacebook({
      titre: "La gestion locative, tenue au carré",
      chapo: "Baux, loyers, documents et incidents réunis.",
      slug: "bienvenue-gerimmo",
      facebookTexte: "Gerimmo simplifie le quotidien des professionnels de la gestion locative.",
      facebookImageUrl: null,
    });
    expect(texte).toContain("Gerimmo simplifie");
    expect(texte).toContain("https://www.gerimmo.app/journal/bienvenue-gerimmo");
    expect(texte).not.toMatch(/OpenAI|assistant|je publie/i);
  });

  it("traduit les erreurs techniques Meta en action compréhensible", () => {
    expect(messageMetaLisible(new Error("(#200) Ad account owner has NOT grant ads_management or ads_read permission")))
      .toBe("Le compte est relié, mais les autorisations Meta Ads restent à accorder à Gerimmo dans Meta Business.");
    expect(messageMetaLisible(new Error("Invalid OAuth access token")))
      .toContain("Renouvelez la connexion");
  });
});

describe("reprise avec une Page et un transport fictifs",()=>{
  const article={id:"21ccaef0-e528-4e7f-84e2-e2fbce7e0d49",titre:"Lancement",chapo:null,slug:"lancement",facebookTexte:"Bienvenue",facebookImageUrl:null};
  beforeEach(()=>{
    vi.stubEnv("META_FACEBOOK_PAGE_ID","123");vi.stubEnv("META_FACEBOOK_PAGE_ACCESS_TOKEN","fictif");vi.stubEnv("VERCEL_ENV","production");
  });
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
  it("refuse une affiche marketing externe avant la réservation et tout appel à Meta",async()=>{
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://stockage.test");
    const fetchTest=vi.fn(),reservation=vi.fn();vi.stubGlobal("fetch",fetchTest);
    await expect(envoyerSurFacebook({...article,facebookImageUrl:"https://tiers.test/image.jpg",afficheMarketing:{empreinte:"a".repeat(64)}},reservation)).rejects.toThrow(/affiche/);
    expect(reservation).not.toHaveBeenCalled();expect(fetchTest).not.toHaveBeenCalled();
  });
  it.each([4,190])("un refus Graph explicite (%i) est reprenable après rétablissement",async(code)=>{
    const fetchTest=vi.fn().mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(Response.json({error:{code}},{status:400}))
      .mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(Response.json({id:"123_9"}));
    vi.stubGlobal("fetch",fetchTest);
    await expect(envoyerSurFacebook(article)).rejects.toBeInstanceOf(RefusFacebookCertain);
    await expect(envoyerSurFacebook(article)).resolves.toMatchObject({post_id:"123_9"});
  });
  it("une réponse perdue est rapprochée en lecture seule sur la Page exacte",async()=>{
    const fetchTest=vi.fn().mockResolvedValueOnce(Response.json({data:[]})).mockRejectedValueOnce(new Error("connexion interrompue"))
      .mockResolvedValueOnce(Response.json({data:[]})).mockResolvedValueOnce(Response.json({data:[{id:"123_9",message:texteFacebook(article)}]}));
    vi.stubGlobal("fetch",fetchTest);
    await expect(envoyerSurFacebook(article)).rejects.not.toBeInstanceOf(RefusFacebookCertain);
    expect(await retrouverPostFacebook(article,new Date().toISOString())).toBe("123_9");
    expect(fetchTest.mock.calls.filter(([,options])=>options?.method==="POST")).toHaveLength(1);
  });
});
