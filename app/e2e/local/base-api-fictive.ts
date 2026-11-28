/** Écritures E2E : exclusivement la base API fictive sur boucle locale. */
export function baseApiFictive(url: string | undefined): asserts url is string {
  if (!url || !/^postgres(?:ql)?:\/\/postgres(?::gerimmo-ci-local)?@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_(?:sql|lotdeux|lottrois|vun|finalisation|demo_vente|ux_browser|mission_trois)_api$/.test(url)) {
    throw new Error("Base API fictive locale obligatoire");
  }
}
