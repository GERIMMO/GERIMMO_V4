import { describe, expect, it, vi } from "vitest";
import { configurationAr24, signatureAr24, dechiffrerAr24, dateAr24, empreinteCourrierAr24, envoyerRecommandeAr24, lireRecommandeAr24, retrouverRecommandeAr24, EnvoiAr24Incertain, type ConfigurationAr24, type CourrierAr24 } from "@/lib/ar24";
const config: ConfigurationAr24 = {baseUrl:"https://sandbox.ar24.fr/api",token:"test-token",clePrivee:"test-private"};
const demande = (): CourrierAr24 => {
 const c={reference:"commande-test",expediteurId:17,destinataire:{email:"locataire@example.test",prenom:"Léa",nom:"Test"},contenu:"Courrier fictif",piecesJointes:[4],consentement:{accepte:true,email:"locataire@example.test"},tarifTtcCentimes:123,tarifConfirmeCentimes:123,destinataireConfirme:"locataire@example.test",empreinteConfirmee:"",otp:"OTP-TEST"};
 c.empreinteConfirmee=empreinteCourrierAr24(c);return c;
};
const reponse=(extra:Record<string,unknown>={})=>Response.json({status:"SUCCESS",result:{id:38,is_eidas:true,status:"waiting",ref_dossier:"commande-test",id_sender:17,to_email:"locataire@example.test",...extra}});
describe("AR24, protocole officiel sans appel réel",()=>{
 it("ne devine pas une configuration de production",()=>{
  expect(configurationAr24({})).toBeNull();expect(configurationAr24({AR24_TOKEN:"x",AR24_PRIVATE_KEY:"y"})).toBeNull();
  expect(configurationAr24({AR24_TOKEN:"x",AR24_PRIVATE_KEY:"y",AR24_ENVIRONMENT:"sandbox"})?.baseUrl).toBe(config.baseUrl);
 });
 it("reproduit les vecteurs cryptographiques publiés par AR24",()=>{
  expect(signatureAr24("2021-05-26 14:00:00","7X9gx9E3Qx4EiUdB63nc")).toBe("bDop0cbjKpkySlpvnNGvBMg7PuYFFgPPqTTS2RAHoY0=");
  expect(dechiffrerAr24("WwBOU6s8DaMWmYdctBJwfuoujFgVygBUjhsbdf8eWqQ=","2021-05-26 14:00:00","7X9gx9E3Qx4EiUdB63nc")).toBe('{status: "SUCCESS"}');
 });
 it("suit l’heure de Paris en hiver et été",()=>{
  expect(dateAr24(new Date("2026-01-01T10:00:00Z"))).toBe("2026-01-01 11:00:00");expect(dateAr24(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01 12:00:00");
 });
 it("refuse coût, contenu ou destinataire modifiés, accord absent et absence d’authentification",async()=>{
  const fetcher=vi.fn();
  for(const changes of [{tarifTtcCentimes:200},{contenu:"Autre"},{destinataireConfirme:"autre@test.local"},{consentement:{accepte:false,email:"locataire@example.test"}},{otp:undefined}]) {
   await expect(envoyerRecommandeAr24(config,{...demande(),...changes},fetcher)).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("forme un vrai appel eIDAS signé et distingue un brouillon du courrier envoyé",async()=>{
  const fetcher=vi.fn(async()=>reponse({status:"to_valid"}));
  expect((await envoyerRecommandeAr24(config,demande(),fetcher)).etat).toBe("a_authentifier");
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://sandbox.ar24.fr/api/mail");expect(init.redirect).toBe("error");
  const params=new URLSearchParams(String(init.body));expect(params.get("eidas")).toBe("1");expect(params.get("attachment[0]")).toBe("4");expect(new Headers(init.headers).get("signature")).toBeTruthy();
 });
 it("un délai réseau ne provoque aucune réexpédition automatique",async()=>{
  const fetcher=vi.fn(async()=>{throw new Error("timeout");});
  await expect(envoyerRecommandeAr24(config,demande(),fetcher)).rejects.toBeInstanceOf(EnvoiAr24Incertain);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("refuse une réponse non qualifiée, un autre dossier et une preuve extérieure",async()=>{
  await expect(lireRecommandeAr24(config,38,"commande-test",async()=>reponse({is_eidas:false}))).rejects.toThrow("qualifié");
  await expect(lireRecommandeAr24(config,38,"autre",async()=>reponse())).rejects.toThrow("correspond pas");
  await expect(lireRecommandeAr24(config,38,"commande-test",async()=>reponse({proof_ar_url:"https://evil.test/get/proof/a"}))).rejects.toThrow("inattendue");
 });
 it("classe les preuves de réception, refus et non-réclamation sans exposer les secrets",async()=>{
  for(const [date,etat] of [["view_date","recu"],["refused_date","refuse"],["negligence_date","non_reclame"]]) expect((await lireRecommandeAr24(config,38,"commande-test",async()=>reponse({[date]:"2026-10-28"}))).etat).toBe(etat);
  await expect(lireRecommandeAr24(config,38,"commande-test",async()=>Response.json({status:"ERROR",message:"secret"}))).rejects.toThrow("n’a pas confirmé");
 });
 it("un signal d’échec ne contredit jamais une preuve de transmission",async()=>{
  expect((await lireRecommandeAr24(config,38,"commande-test",async()=>reponse({send_fail:true}))).etat).toBe("echec");
  expect((await lireRecommandeAr24(config,38,"commande-test",async()=>reponse({send_fail:true,proof_ev_url:"https://sandbox.ar24.fr/get/proof/ev-38"}))).etat).toBe("envoye");
  expect((await lireRecommandeAr24(config,38,"commande-test",async()=>reponse({send_fail:true,view_date:"2026-10-28"}))).etat).toBe("recu");
 });
});

it("retrouve une référence exacte après réponse perdue, sans ambiguïté et sans POST",async()=>{
 const fetcher=vi.fn(async()=>Response.json({status:"SUCCESS",result:[{id:38,is_eidas:true,status:"waiting",ref_dossier:"commande-test",id_sender:17,to_email:"locataire@example.test"}]}));
 expect((await retrouverRecommandeAr24(config,"commande-test",17,"locataire@example.test",fetcher))?.id).toBe(38);
 const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(init.method).toBe("GET");expect(new URL(url).searchParams.get("ref_dossier")).toBe("commande-test");
 expect(await retrouverRecommandeAr24(config,"commande-test",17,"locataire@example.test",async()=>Response.json({status:"SUCCESS",result:[]}))).toBeNull();
 await expect(retrouverRecommandeAr24(config,"commande-test",17,"locataire@example.test",async()=>Response.json({status:"SUCCESS",result:[{},{}]}))).rejects.toThrow("Plusieurs");
});
