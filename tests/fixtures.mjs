// Synthetic shop and prices are confined to test fixtures.
export const TEST_LOCALITY = {
  verified: true,
  stores: [
    {
      id: "test-local-store",
      area: "fredrikstad",
      name: "Meny Fredrikstad",
      city: "Fredrikstad",
      postcode: "1600",
    },
  ],
};
export const localTestOffer = (offer) => ({
  ...offer,
  locality: TEST_LOCALITY,
});
