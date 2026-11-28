// Le serveur ne contacte que la boucle locale. Le transport de courriel est simulé en mémoire.
const fetchLocal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  if (url.href === "https://api.resend.com/emails" && init?.method === "POST") {
    const { to } = JSON.parse(init.body);
    if (!Array.isArray(to) || !to.length || !to.every(adresse => /@example\.(invalid|com)$/.test(adresse))) {
      return Promise.resolve(Response.json({ message: "Adresse fictive requise" }, { status: 400 }));
    }
    return Promise.resolve(Response.json({ id: "gerimmo-demo-" + crypto.randomUUID() }));
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return Promise.reject(new Error("Réseau extérieur fermé pour la démonstration"));
  }
  return fetchLocal(input, init);
};
