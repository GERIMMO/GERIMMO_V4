// Banc de recette uniquement. Facteurs/challenges en mémoire, perdus au redémarrage.
// La production utilise exclusivement Supabase Auth ; ce fichier n'y est pas chargé.
import crypto from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encoderBase32(bytes) {
  let bits = 0, valeur = 0, resultat = '';
  for (const b of bytes) { valeur = (valeur << 8) | b; bits += 8; while (bits >= 5) { resultat += alphabet[(valeur >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) resultat += alphabet[(valeur << (5 - bits)) & 31];
  return resultat;
}
export function totp(secret, timestamp = Date.now(), chiffres = 6) {
  let bits = 0, valeur = 0; const bytes = [];
  for (const c of secret.toUpperCase().replace(/=+$/, '')) {
    const n = alphabet.indexOf(c); if (n < 0) throw new Error('Clé TOTP invalide');
    valeur = (valeur << 5) | n; bits += 5;
    if (bits >= 8) { bytes.push((valeur >>> (bits - 8)) & 255); bits -= 8; }
  }
  const compteur = Buffer.alloc(8); compteur.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30000)));
  const h = crypto.createHmac('sha1', Buffer.from(bytes)).update(compteur).digest();
  const position = h[h.length - 1] & 15;
  return String((h.readUInt32BE(position) & 0x7fffffff) % (10 ** chiffres)).padStart(chiffres, '0');
}
const facteurs = new Map(), challenges = new Map();

/**
 * Vide le magasin — banc uniquement, jamais appelé par l'application.
 *
 * Les facteurs vivent en mémoire : ils survivent donc au harnais, pas au
 * redémarrage de l'émulateur. Sans remise à zéro, `auth.setup.ts` ne pouvait
 * tourner qu'UNE fois par processus : au deuxième passage, /securite voyait le
 * facteur du passage précédent, n'offrait plus « Configurer mon application »,
 * et le setup mourait sur un bouton absent — en emportant toute la suite
 * navigateur (constat du 19/09).
 */
export function oublierFacteurs() {
  facteurs.clear();
  challenges.clear();
}

export function facteursPour(compte) {
  return [...facteurs.values()].filter(f => f.compte === compte).map(f => ({
    id: f.id, friendly_name: f.friendly_name, factor_type: 'totp', status: f.status,
    created_at: f.created_at, updated_at: f.created_at,
  }));
}
export function routerMfaLocal(methode, chemin, corps, claims) {
  const erreur = (statut, msg) => ({ statut, corps: { code: 'mfa_verification_failed', msg } });
  if (!claims?.sub) return erreur(401, 'Session requise');
  if (chemin === 'factors' && methode === 'POST') {
    if (corps.factor_type !== 'totp') return erreur(400, 'Seul TOTP est émulé');
    if (facteursPour(claims.sub).length >= 10) return erreur(422, 'Trop de facteurs');
    const f = { id: crypto.randomUUID(), compte: claims.sub, secret: encoderBase32(crypto.randomBytes(20)), status: 'unverified', friendly_name: corps.friendly_name, created_at: new Date().toISOString() };
    facteurs.set(f.id, f);
    return { statut: 200, corps: { id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: {
      secret: f.secret, uri: `otpauth://totp/Gerimmo-local?secret=${f.secret}&issuer=Gerimmo-local`,
      qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="white"/><text x="15" y="100" fill="black" font-size="14">Recette locale :</text><text x="15" y="125" fill="black" font-size="14">utiliser la clé manuelle</text></svg>',
    } } };
  }
  const [, id, operation] = chemin.split('/'); const f = facteurs.get(id);
  if (!f || f.compte !== claims.sub) return erreur(404, 'Facteur introuvable');
  if (methode === 'DELETE' && !operation) {
    if (f.status === 'verified' && claims.aal !== 'aal2') return erreur(403, 'Second facteur requis');
    facteurs.delete(id); return { statut: 200, corps: { id } };
  }
  if (methode === 'POST' && operation === 'challenge') {
    const challenge = { id: crypto.randomUUID(), type: 'totp', expires_at: Math.floor(Date.now()/1000)+300 };
    challenges.set(challenge.id, { ...challenge, facteur: id, compte: claims.sub, essais: 0 });
    return { statut: 200, corps: challenge };
  }
  if (methode === 'POST' && operation === 'verify') {
    const c = challenges.get(corps.challenge_id);
    if (!c || c.compte !== claims.sub || c.facteur !== id || c.expires_at < Date.now()/1000 || c.essais >= 5) return erreur(400, 'Challenge invalide');
    c.essais++;
    const code = String(corps.code ?? '');
    if (!/^\d{6}$/.test(code) || ![-30000,0,30000].some(delta => crypto.timingSafeEqual(Buffer.from(code), Buffer.from(totp(f.secret, Date.now()+delta))))) return erreur(400, 'Code incorrect');
    challenges.delete(c.id); f.status = 'verified';
    return { valide: true };
  }
  return erreur(404, 'Opération MFA inconnue');
}
