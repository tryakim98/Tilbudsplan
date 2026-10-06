export const LOCAL_AREA_LABEL =
  "Fredrikstad, Sarpsborg og Mysen med nærområder";
const normal = (s) =>
  String(s || "")
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
const places = {
  fredrikstad: [
    "fredrikstad",
    "gamle fredrikstad",
    "rolvsøy",
    "kråkerøy",
    "gressvik",
    "sellebakk",
    "torp",
    "manstad",
    "engelsviken",
    "slevik",
  ],
  sarpsborg: [
    "sarpsborg",
    "borgenhaugen",
    "greåker",
    "grålum",
    "hafslundsøy",
    "skjeberg",
    "ise",
    "varteig",
  ],
  mysen: ["mysen", "slitu", "brennemoen"],
};
export function areaForStore(store) {
  if (store?.country?.id !== "NO") return null;
  const city = normal(store.city);
  return (
    Object.entries(places).find(([, names]) =>
      names.some((name) => normal(name) === city),
    )?.[0] || null
  );
}
export function isLocalOffer(offer) {
  // Own offers are explicitly entered by the user for this shopping area.
  if (offer?.manual) return true;
  return !!(
    offer?.locality?.verified === true &&
    Array.isArray(offer.locality.stores) &&
    offer.locality.stores.some(
      (s) =>
        s?.id &&
        areaForStore({ city: s.city, country: { id: "NO" } }) === s.area,
    )
  );
}
export function localOfferLabel(offer) {
  if (offer.manual) return "Eget tilbud i handleområdet";
  if (!isLocalOffer(offer)) return "Lokal gyldighet er ikke bekreftet";
  const names = [
    ...new Set(offer.locality.stores.map((s) => s.name || s.city)),
  ];
  return (
    "Gjelder hos " +
    names.slice(0, 3).join(", ") +
    (names.length > 3 ? ` og ${names.length - 3} andre lokale butikker` : "")
  );
}
