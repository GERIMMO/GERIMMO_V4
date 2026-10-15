/**
 * Invitation d'un artisan par un propriétaire direct (décision du dirigeant du 15/10/2026) : le côté application.
 *
 *  - les gestes du propriétaire (inviter, renvoyer, annuler) ne partent qu'avec le rôle de propriétaire et une saisie
 *    bien formée ; l'e-mail porte la marque Gerimmo, le nom de l'organisation, le lien de l'invitation, et RIEN du bien
 *    ni du locataire ; un envoi non configuré le dit (« n'a pas été envoyé ») et la base en garde la trace ;
 *  - la réponse de l'artisan ne part qu'avec une session et une décision explicite ;
 *  - l'adresse pré-remplie voyage dans l'ancre du lien, jamais dans le chemin ni les paramètres ;
 *  - l'état lisible de chaque ligne du carnet du propriétaire ;
 *  - la page d'invitation est publique dans le proxy (sans session, l'artisan y crée son compte).
 * Les règles d'accès elles-mêmes sont éprouvées en base : invitation-artisan-proprietaire.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), garde: vi.fn(), courriel: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.garde }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc, auth: { getUser: m.getUser } }) }));
vi.mock("@/lib/email", () => ({ envoyerEmail: m.courriel }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));

import {
  agirSurInvitationArtisan,
  annulerInvitationArtisan,
  inviterArtisan,
  renvoyerInvitationArtisan,
  repondreInvitationArtisan,
} from "@/app/actions/invitations-artisan";
import {
  LONGUEUR_MAX_NOM_INVITANT,
  VISIBLE_APRES_ACCEPTATION,
  adresseDepuisAncre,
  cheminCarnetInvitation,
  etatLigneCarnet,
  lienInvitationArtisan,
  nomInvitant,
  type LigneCarnetArtisan,
} from "@/lib/invitations-artisan";
import { messageInvitationArtisan } from "@/lib/notifications";

const org = "11111111-1111-4111-8111-111111111111";
const inv = "33333333-3333-4333-8333-333333333333";
const preparee = { id: inv, email: "artisan@example.invalid", organisation: "Parc de Claire Moreau", expire_le: "2026-11-14T10:00:00Z" };

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  return f;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.gerimmo.app";
  m.garde.mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "proprietaire" }, role: "proprietaire_direct" });
  m.getUser.mockResolvedValue({ data: { user: { id: "artisan" } } });
  m.courriel.mockResolvedValue({});
  m.rpc.mockImplementation(async (nom: string) =>
    nom === "noter_envoi_invitation_artisan" ? { data: null, error: null } : { data: preparee, error: null }
  );
});

describe("inviter un artisan (propriétaire)", () => {
  it.each(["admin_agence", "agent", "locataire", null])("refusé au rôle %s avant tout appel en base ni e-mail", async (role) => {
    m.garde.mockResolvedValue({ supabase: { rpc: m.rpc }, user: role ? { id: "x" } : null, role });
    expect((await inviterArtisan(org, {}, formulaire({ email: "a@b.fr" }))).erreur).toMatch(/réservée au propriétaire/);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.courriel).not.toHaveBeenCalled();
  });

  it("refuse une adresse absente ou mal formée, et un métier hors liste, sans appeler la base", async () => {
    expect((await inviterArtisan(org, {}, formulaire({ email: "" }))).erreur).toMatch(/adresse e-mail/);
    expect((await inviterArtisan(org, {}, formulaire({ email: "pas-une-adresse" }))).erreur).toMatch(/pas valide/);
    expect((await inviterArtisan(org, {}, formulaire({ email: "a@b.fr", metier: "astrologie" }))).erreur).toMatch(/métier de la liste/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("prépare en base (adresse en minuscules), envoie l'e-mail Gerimmo, puis note l'envoi", async () => {
    const r = await inviterArtisan(org, {}, formulaire({ email: " Artisan@Example.INVALID ", nom: "M. Martin", metier: "plomberie" }));
    expect(r.succes).toContain("Invitation envoyée à artisan@example.invalid");
    expect(m.rpc).toHaveBeenNthCalledWith(1, "preparer_invitation_artisan", {
      p_org: org, p_email: "artisan@example.invalid", p_nom: "M. Martin", p_metier: "plomberie",
    });
    const courriel = m.courriel.mock.calls[0][0];
    expect(courriel.to).toBe("artisan@example.invalid");
    expect(courriel).not.toHaveProperty("organisation"); // marque Gerimmo, pas celle de l'organisation
    expect(courriel.html).toContain(`https://www.gerimmo.app/artisan/invitation/${inv}#adresse=artisan%40example.invalid`);
    expect(m.rpc).toHaveBeenNthCalledWith(2, "noter_envoi_invitation_artisan", { p_id: inv, p_envoye: true });
  });

  it("e-mail non configuré : l'écran le dit honnêtement et la base garde « non envoyé »", async () => {
    m.courriel.mockResolvedValue({ erreur: "Envoi des e-mails non configuré. Contactez l’administrateur." });
    const r = await inviterArtisan(org, {}, formulaire({ email: "artisan@example.invalid" }));
    expect(r.succes).toBeUndefined();
    expect(r.erreur).toContain("Invitation à artisan@example.invalid enregistrée, mais l’e-mail n’a pas été envoyé");
    expect(r.erreur).toContain("renvoyer");
    expect(m.rpc).toHaveBeenCalledWith("noter_envoi_invitation_artisan", { p_id: inv, p_envoye: false });
  });

  it("le refus de la base (doublon, limite) est rendu tel quel, sans e-mail", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Une invitation est déjà en attente pour cette adresse. Utilisez « Renvoyer » dans votre carnet" } });
    expect((await inviterArtisan(org, {}, formulaire({ email: "artisan@example.invalid" }))).erreur).toContain("déjà en attente");
    expect(m.courriel).not.toHaveBeenCalled();
  });

  it("renvoyer : même lien, nouvelle trace ; une invitation expirée le dit sans e-mail", async () => {
    expect((await renvoyerInvitationArtisan(org, inv, {}, new FormData())).succes).toContain("renvoyée");
    expect(m.rpc).toHaveBeenNthCalledWith(1, "renvoyer_invitation_artisan", { p_id: inv });
    // Même lien que la première fois (même invitation, même ancre), et l'envoi est noté comme pour une invitation.
    expect(m.courriel).toHaveBeenCalledTimes(1);
    expect(m.courriel.mock.calls[0][0].to).toBe("artisan@example.invalid");
    expect(m.courriel.mock.calls[0][0].html).toContain(`href="https://www.gerimmo.app/artisan/invitation/${inv}#adresse=artisan%40example.invalid"`);
    expect(m.rpc).toHaveBeenNthCalledWith(2, "noter_envoi_invitation_artisan", { p_id: inv, p_envoye: true });
    expect(m.rpc).toHaveBeenCalledTimes(2);
    m.courriel.mockClear();
    m.rpc.mockResolvedValue({ data: { etat: "expiree", erreur: "Cette invitation a expiré. Invitez de nouveau cet artisan." }, error: null });
    expect((await renvoyerInvitationArtisan(org, inv, {}, new FormData())).erreur).toContain("expiré");
    expect(m.courriel).not.toHaveBeenCalled();
  });

  it("annuler passe par la base, et refuse un identifiant mal formé", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    expect((await annulerInvitationArtisan(org, inv, {}, new FormData())).succes).toContain("annulée");
    expect(m.rpc).toHaveBeenCalledWith("annuler_invitation_artisan", { p_id: inv });
    m.rpc.mockClear();
    expect((await annulerInvitationArtisan(org, "pas-un-uuid", {}, new FormData())).erreur).toBeTruthy();
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

// Relecture du 15/10 (accessibilité) : les gestes des lignes passent par une seule action, dont le message vit au niveau
// de la liste (la ligne change sous le bouton). Le parcours navigateur vérifie l'annonce et le focus.
describe("les gestes d'une ligne du carnet", () => {
  const geste = (champs: Record<string, string>) => agirSurInvitationArtisan(org, {}, formulaire(champs));

  it("annuler : le message nomme l'adresse, puisqu'il s'affiche hors de la ligne", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    expect((await geste({ geste: "annuler", invitation: inv, email: "artisan@example.invalid" })).succes).toBe(
      "Invitation à artisan@example.invalid annulée : l’artisan ne pourra plus l’accepter."
    );
    expect(m.rpc).toHaveBeenCalledWith("annuler_invitation_artisan", { p_id: inv });
    expect((await geste({ geste: "annuler", invitation: inv, email: "pas une adresse" })).succes).toBe("Invitation annulée : l’artisan ne pourra plus l’accepter.");
  });

  it("renvoyer et inviter de nouveau passent par les mêmes contrôles que les gestes seuls", async () => {
    expect((await geste({ geste: "renvoyer", invitation: inv })).succes).toContain("renvoyée");
    expect(m.rpc).toHaveBeenNthCalledWith(1, "renvoyer_invitation_artisan", { p_id: inv });
    m.rpc.mockClear();
    const r = await geste({ geste: "reinviter", email: "Artisan@Example.invalid", nom: "M. Martin", metier: "plomberie" });
    expect(r.succes).toContain("Invitation envoyée à artisan@example.invalid");
    expect(r).not.toHaveProperty("valeurs");
    expect(m.rpc).toHaveBeenNthCalledWith(1, "preparer_invitation_artisan", {
      p_org: org, p_email: "artisan@example.invalid", p_nom: "M. Martin", p_metier: "plomberie",
    });
    m.garde.mockResolvedValue({ supabase: { rpc: m.rpc }, user: { id: "x" }, role: "agent" });
    m.rpc.mockClear();
    expect((await geste({ geste: "annuler", invitation: inv })).erreur).toMatch(/réservée au propriétaire/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("un geste inconnu n'appelle rien", async () => {
    expect((await geste({ geste: "supprimer", invitation: inv })).erreur).toMatch(/pas reconnu/);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.courriel).not.toHaveBeenCalled();
  });
});

describe("répondre à une invitation (artisan)", () => {
  it("sans décision explicite ou sans session, rien n'est envoyé à la base", async () => {
    expect(await repondreInvitationArtisan(inv, {}, new FormData())).toHaveProperty("erreur");
    m.getUser.mockResolvedValue({ data: { user: null } });
    expect(await repondreInvitationArtisan(inv, {}, formulaire({ decision: "accepter" }))).toHaveProperty("erreur");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("accepter : la base décide ; son refus (liste noire, inscription manquante) s'affiche tel quel", async () => {
    m.rpc.mockResolvedValue({ data: { etat: "acceptee" }, error: null });
    expect((await repondreInvitationArtisan(inv, {}, formulaire({ decision: "accepter" }))).succes).toContain("carnet");
    expect(m.rpc).toHaveBeenCalledWith("repondre_invitation_artisan", { p_id: inv, p_accepter: true });
    m.rpc.mockResolvedValue({ data: { etat: "en_attente", erreur: "Cette invitation ne peut pas aboutir. Contactez la personne qui vous a invité." }, error: null });
    expect((await repondreInvitationArtisan(inv, {}, formulaire({ decision: "accepter" }))).erreur).toContain("ne peut pas aboutir");
  });

  it("refuser : rien n'est partagé", async () => {
    m.rpc.mockResolvedValue({ data: { etat: "refusee" }, error: null });
    expect((await repondreInvitationArtisan(inv, {}, formulaire({ decision: "refuser" }))).succes).toContain("Rien n’a été partagé");
    expect(m.rpc).toHaveBeenCalledWith("repondre_invitation_artisan", { p_id: inv, p_accepter: false });
  });
});

describe("l'e-mail d'invitation", () => {
  const message = messageInvitationArtisan({
    organisation: "Parc de Claire Moreau",
    lien: lienInvitationArtisan("https://www.gerimmo.app/", inv, "artisan@example.invalid"),
    expireLe: "2026-11-14T23:30:00Z",
  });
  const texte = message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("nomme l'organisation et Gerimmo, dit l'échéance (jour de Paris) et la suite du parcours", () => {
    // Sujet FIXE (relecture du 15/10) : le texte libre de l'organisation n'est jamais dans le sujet.
    expect(message.sujet).toBe("Invitation à rejoindre un carnet d’artisans sur Gerimmo");
    expect(texte).toContain("Parc de Claire Moreau souhaite vous ajouter à son carnet d’artisans sur Gerimmo");
    expect(texte).toContain("valable jusqu’au 15 novembre 2026");
    expect(texte).toContain("Gerimmo vérifie votre inscription avant toute demande d’intervention");
    expect(texte).toContain("L’équipe Gerimmo");
    expect(message.html).toContain(`href="https://www.gerimmo.app/artisan/invitation/${inv}#adresse=artisan%40example.invalid"`);
  });

  it("ne dit rien d'un bien ni d'un locataire", () => {
    expect(texte.toLowerCase()).not.toMatch(/adresse du bien|locataire|logement|loyer|lot /);
  });
});

/**
 * Relecture du 15/10 (sécurité) : le nom de l'organisation est un texte libre de l'invitant, sans borne en base. Il part
 * vers une adresse quelconque, sous la marque Gerimmo : sans assainissement, Gerimmo relaierait un hameçonnage
 * (« ALERTE Gerimmo… appelez le 08 99… »). Le nom est borné, nettoyé, et remplacé par une formule neutre s'il contient
 * un lien, une adresse, un numéro ou le nom de Gerimmo — dans l'e-mail, sur la page de l'artisan et à la validation.
 */
describe("le nom de l'organisation qui invite", () => {
  const piege = `ALERTE Gerimmo : votre compte artisan sera suspendu sous 24 h. Régularisez sur https://gerimmo-verification.example/connexion ou appelez le 08 99 00 00 00\r\nBcc: x@y.z ${".".repeat(2000)}`;

  it("un nom ordinaire est gardé tel quel, sans caractère de contrôle ni espaces en trop", () => {
    expect(nomInvitant("Parc de Claire Moreau")).toBe("Parc de Claire Moreau");
    expect(nomInvitant("  SCI   Les Tilleuls\r\n\u202Eéfil ")).toBe("SCI Les Tilleuls éfil");
    expect(nomInvitant("Résidence 2024 — M. et Mme Dupont")).toBe("Résidence 2024 — M. et Mme Dupont");
  });

  it("un nom trop long est tronqué", () => {
    const nom = nomInvitant("Parc ".repeat(100));
    expect(nom).not.toBeNull();
    expect(Array.from(nom!).length).toBeLessThanOrEqual(LONGUEUR_MAX_NOM_INVITANT);
    expect(nom!.endsWith("…")).toBe(true);
  });

  it.each([
    ["lien", "Voir https://exemple.invalid/x"],
    ["www", "Parc www.exemple.invalid"],
    ["domaine", "Parc gerance-dupont.fr"],
    ["adresse", "Parc contact@exemple.invalid"],
    ["téléphone", "Parc Dupont 06 12 34 56 78"],
    ["téléphone international", "Parc +33612345678"],
    ["marque", "Service sécurité GERIMMO"],
    ["vide", "   "],
    ["absent", null],
  ])("%s : formule neutre", (_cas, nom) => {
    expect(nomInvitant(nom)).toBeNull();
  });

  it("l'e-mail ne reprend du nom piégé ni le lien, ni le numéro, ni l'en-tête injecté", () => {
    const m2 = messageInvitationArtisan({ organisation: piege, lien: lienInvitationArtisan("https://www.gerimmo.app", inv, "a@b.fr"), expireLe: "2026-11-14T10:00:00Z" });
    expect(m2.sujet).toBe("Invitation à rejoindre un carnet d’artisans sur Gerimmo");
    expect(m2.html).toContain("Un propriétaire souhaite vous ajouter à son carnet d’artisans sur Gerimmo");
    for (const interdit of ["gerimmo-verification", "08 99", "Bcc", "\r", "ALERTE"]) expect(m2.html).not.toContain(interdit);
    const long = messageInvitationArtisan({ organisation: "Parc ".repeat(400), lien: "https://www.gerimmo.app/x", expireLe: "2026-11-14T10:00:00Z" });
    expect(long.html.length).toBeLessThan(m2.html.length + 200);
  });

  it("la page de l'artisan et la console de validation n'affichent jamais le nom brut", () => {
    const racine = path.resolve(__dirname, "..", "src/app");
    const page = readFileSync(path.join(racine, "artisan/invitation/[invitationId]/page.tsx"), "utf8");
    const validation = readFileSync(path.join(racine, "admin/artisans/page.tsx"), "utf8");
    expect(page).not.toMatch(/\{invitation\.organisation\}/);
    expect(page).toContain("nomInvitant(");
    expect(validation).not.toMatch(/\{i\.organisation\}/);
    expect(validation).toContain("nomInvitant(");
  });
});

/**
 * Relecture du 15/10 : le texte de consentement promettait « le nom de votre entreprise et votre téléphone », alors
 * qu'une fois l'invitation acceptée la base ouvre au propriétaire la fiche de l'artisan. Seconde relecture du 15/10 : les
 * colonnes de décision internes (motifs, auteurs, purge) ne sont plus lisibles par un client (20261014842000) ; le texte
 * dit exactement ce que la base ouvre — chaque colonne lisible y a ses mots — et que les motifs ne sont jamais montrés.
 * Ce que la base ouvre est éprouvé dans artisans-colonnes-internes.test.ts et invitation-artisan-proprietaire.test.ts.
 */
describe("ce que l'artisan accepte de montrer", () => {
  it("le texte nomme tout ce que le propriétaire verra, colonne par colonne", () => {
    const elements: [string, string][] = [
      ["raison_sociale", "nom de votre entreprise"],
      ["siret", "SIRET"],
      ["siret_etat", "vérification"],
      ["telephone", "téléphone"],
      ["email", "adresse e-mail"],
      ["visibilite", "visibilité de votre profil"],
      ["statut_plateforme", "état chez Gerimmo"],
      ["blacklist_globale_le", "exclusion"],
      ["created_at", "date de votre inscription"],
      ["artisan_metiers", "métiers"],
      ["artisan_zones", "zone d’intervention"],
    ];
    for (const [colonne, element] of elements) expect(VISIBLE_APRES_ACCEPTATION, colonne).toContain(element);
  });

  it("le texte ne promet plus les motifs : il dit qu'ils ne sont jamais montrés", () => {
    expect(VISIBLE_APRES_ACCEPTATION).not.toMatch(/et les motifs de ses décisions/);
    expect(VISIBLE_APRES_ACCEPTATION).toMatch(/jamais les motifs des décisions de Gerimmo/);
  });

  it("la page d'invitation affiche ce texte, et plus l'ancienne promesse", () => {
    const page = readFileSync(path.resolve(__dirname, "..", "src/app/artisan/invitation/[invitationId]/page.tsx"), "utf8");
    expect(page).toContain("{VISIBLE_APRES_ACCEPTATION}");
    expect(page).not.toContain("Il verra le nom de votre");
  });
});

describe("le lien et l'adresse pré-remplie", () => {
  it("l'adresse voyage dans l'ancre, jamais dans le chemin ni les paramètres", () => {
    const lien = new URL(lienInvitationArtisan("https://www.gerimmo.app", inv, "a.b+c@example.invalid"));
    expect(lien.pathname).toBe(`/artisan/invitation/${inv}`);
    expect(lien.search).toBe("");
    expect(adresseDepuisAncre(lien.hash)).toBe("a.b+c@example.invalid");
  });

  it("une ancre absente ou trafiquée ne pré-remplit rien", () => {
    expect(adresseDepuisAncre("")).toBe("");
    expect(adresseDepuisAncre("#adresse=pas-une-adresse")).toBe("");
    expect(adresseDepuisAncre("#autre=a@b.fr")).toBe("");
  });

  it("la voie de sortie mène au formulaire d'invitation du carnet", () => {
    expect(cheminCarnetInvitation(org)).toBe(`/agence/${org}/artisans#inviter-un-artisan`);
  });
});

describe("l'état lisible d'une ligne du carnet", () => {
  const base: LigneCarnetArtisan = {
    invitation_id: inv, email: "artisan@example.invalid", nom_memo: null, metier_memo: null, etat_invitation: "en_attente",
    invite_le: "2026-10-15T08:00:00Z", envoye_le: "2026-10-15T08:00:01Z", erreur_envoi: false, expire_le: "2026-11-14T08:00:00Z",
    repondu_le: null, artisan_id: null, raison_sociale: null, telephone: null, statut_plateforme: null, sollicitable_plateforme: null,
    relation_statut: null, liste_noire: null, metiers: null, codes_postaux: null,
  };
  const artisan = { ...base, etat_invitation: "acceptee" as const, artisan_id: "a1", raison_sociale: "Plomberie", relation_statut: "actif" as const, liste_noire: false };

  it("avant l'acceptation : l'état de l'invitation, et les gestes possibles", () => {
    expect(etatLigneCarnet(base)).toMatchObject({ libelle: "Invitation envoyée le 15/10/2026", renvoyer: true, annuler: true });
    expect(etatLigneCarnet({ ...base, envoye_le: null, erreur_envoi: true }).libelle).toBe("Invitation enregistrée le 15/10/2026, e-mail non envoyé");
    expect(etatLigneCarnet({ ...base, etat_invitation: "expiree" })).toMatchObject({ libelle: "Invitation expirée", reinviter: true, renvoyer: false });
    expect(etatLigneCarnet({ ...base, etat_invitation: "annulee" })).toMatchObject({ libelle: "Annulée", reinviter: true });
    expect(etatLigneCarnet({ ...base, etat_invitation: "refusee" })).toMatchObject({ libelle: "Invitation refusée par l’artisan", reinviter: false });
  });

  it("après l'acceptation : la validation de Gerimmo, puis la relation", () => {
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "en_attente" }).libelle).toBe("Inscrit, en attente de validation par Gerimmo");
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "valide", sollicitable_plateforme: true }).libelle).toBe("Validé — peut être sollicité");
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "valide", sollicitable_plateforme: false }).libelle).toBe("Ne peut pas être sollicité pour le moment");
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "refuse" }).libelle).toBe("Inscription refusée par Gerimmo");
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "valide", sollicitable_plateforme: true, relation_statut: "desactive" }).libelle).toBe("Désactivé dans votre carnet");
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "valide", sollicitable_plateforme: true, liste_noire: true }).libelle).toBe("Sur votre liste noire");
    expect(etatLigneCarnet({ ...artisan, statut_plateforme: "valide" })).toMatchObject({ renvoyer: false, annuler: false, reinviter: false });
  });
});

describe("la page d'invitation est publique (proxy)", () => {
  it("le proxy laisse passer /artisan/invitation sans session, et pas le reste du portail", () => {
    const proxy = readFileSync(path.resolve(__dirname, "..", "src/proxy.ts"), "utf8");
    const liste = proxy.slice(proxy.indexOf("const PUBLIC_PATHS"), proxy.indexOf("];"));
    expect(liste).toContain('"/artisan/invitation"');
    expect(liste).not.toMatch(/"\/artisan"\s*,/);
  });
});
