/** Price literals: "S/ 50", "€40", "40 €" (spaces optional). */
const PRICE = /S\/\s?(\d+(?:[.,]\d+)?)|€\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?€/g;

/** @returns {{raw:string, amount:number, form:'S/ n'|'€n'|'n €'}[]} */
export function priceTokens(text) {
  return [...String(text).matchAll(PRICE)].map((m) => ({
    raw: m[0],
    amount: Number((m[1] ?? m[2] ?? m[3]).replace(',', '.')),
    form: m[1] !== undefined ? 'S/ n' : m[2] !== undefined ? '€n' : 'n €',
  }));
}

/** All numeric amounts of a PRECIOS object ({pe:{botella,coleccion}, eu:{...}}). */
export function precioValues(precios) {
  return new Set(Object.values(precios || {}).flatMap((r) => Object.values(r)).map(Number));
}
