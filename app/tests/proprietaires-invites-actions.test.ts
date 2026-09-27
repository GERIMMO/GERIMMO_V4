import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gerant: vi.fn(), user: vi.fn(), rpc: vi.fn(), signUp: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({auth:{getUser:mocks.user,signUp:mocks.signUp},rpc:mocks.rpc}) }));
vi.mock("@/lib/ged-acces", () => ({verifierGerant:mocks.gerant}));
vi.mock("next/headers", () => ({headers:async()=>new Headers({host:"localhost:3100","x-forwarded-proto":"http"})}));
vi.mock("next/cache", () => ({revalidatePath:vi.fn()}));
vi.mock("next/navigation", () => ({redirect:mocks.redirect}));
import { accepterInvitationProprietaire, creerCompteProprietaireInvite, preparerInvitationProprietaire, revoquerInvitationProprietaire } from "@/app/actions/proprietaires-invites";
const jeton="a".repeat(64);
const form=(values:Record<string,string>={})=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,v);return f;};
beforeEach(()=>{
 vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:jeton,error:null});
 mocks.user.mockResolvedValue({data:{user:{id:"invite"}}});
 mocks.gerant.mockResolvedValue({supabase:{rpc:mocks.rpc},user:{id:"admin"},role:"admin_agence"});
 mocks.signUp.mockResolvedValue({data:{session:null},error:null});
 mocks.redirect.mockImplementation(()=>{throw new Error("REDIRECTION_TEST");});
});
describe("Invitations propriétaires — actions explicites et compte distinct",()=>{
 it("un agent ne prépare pas de lien, même en contournant le bouton",async()=>{
   mocks.gerant.mockResolvedValue({supabase:{rpc:mocks.rpc},user:{id:"agent"},role:"agent"});
   expect((await preparerInvitationProprietaire("org","personne",{},form({confirmation:"oui"}))).erreur).toContain("responsable");expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("sans confirmation, aucune invitation ni révocation ni acceptation",async()=>{
   expect((await preparerInvitationProprietaire("org","personne",{},form())).erreur).toContain("Confirmez");
   expect((await revoquerInvitationProprietaire("org","personne",{},form())).erreur).toContain("Confirmez");
   expect((await accepterInvitationProprietaire(jeton,{},form())).erreur).toContain("Confirmez");expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("prépare seulement un lien à copier, sans créer de compte ni envoyer de message",async()=>{
   const r=await preparerInvitationProprietaire("org","personne",{},form({confirmation:"oui"}));
   expect(r.lien).toContain(`/proprietaire-invite/accepter?invitation=${jeton}`);expect(r.succes).toContain("Aucun e-mail");expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("preparer_invitation_proprietaire",{p_org:"org",p_person:"personne"});expect(mocks.signUp).not.toHaveBeenCalled();
 });
 it("sans session ou avec refus de la base, l’invitation ne devient pas un accès",async()=>{
   mocks.user.mockResolvedValueOnce({data:{user:null}});expect((await accepterInvitationProprietaire(jeton,{},form({confirmation:"oui"}))).erreur).toContain("Connectez-vous");expect(mocks.rpc).not.toHaveBeenCalled();
   mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"Adresse vérifiée requise"}});expect((await accepterInvitationProprietaire(jeton,{},form({confirmation:"oui"}))).erreur).toBeTruthy();expect(mocks.redirect).not.toHaveBeenCalled();
 });
 it("la création demandée par l’invité ne contient aucune demande d’espace facturé",async()=>{
   const r=await creerCompteProprietaireInvite(jeton,{},form({nom:"Invité",email:"Invite@exemple.test",mot_de_passe:"mot-de-passe-fictif",confirmation_mot_de_passe:"mot-de-passe-fictif",cgu:"oui"}));
   expect(r.succes).toContain("Aucun abonnement personnel");expect(mocks.signUp).toHaveBeenCalledOnce();
   const argument=mocks.signUp.mock.calls[0][0];expect(argument.email).toBe("invite@exemple.test");expect(argument.options.data.espace).toBe("proprietaire_invite");expect(argument.options.emailRedirectTo).toContain(encodeURIComponent(`/proprietaire-invite/accepter?invitation=${jeton}`));expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("un lien invalide ou les conditions non acceptées ne déclenchent aucune inscription",async()=>{
   expect((await creerCompteProprietaireInvite("incorrect",{},form())).erreur).toContain("invalide");
   const f=form({nom:"Invité",email:"invite@exemple.test",mot_de_passe:"mot-de-passe-fictif",confirmation_mot_de_passe:"mot-de-passe-fictif"});expect((await creerCompteProprietaireInvite(jeton,{},f)).erreur).toContain("conditions");expect(mocks.signUp).not.toHaveBeenCalled();
 });
});
