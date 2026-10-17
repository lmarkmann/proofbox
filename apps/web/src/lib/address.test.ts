import { expect, test } from "vite-plus/test";

import { addressLines, EMPTY_ADDRESS, photonUrl, toSuggestions } from "@/lib/address";

test("an address prints as recipient, street, then postcode and city with the country code", () => {
  expect(
    addressLines({
      recipient: " Acme GmbH ",
      street: "Unter den Linden 5",
      postcode: "10117",
      city: "Berlin",
      country: "DE",
    }),
  ).toEqual(["Acme GmbH", "Unter den Linden 5", "10117 Berlin, DE"]);
  expect(addressLines({ ...EMPTY_ADDRESS, city: "Wien", country: "AT" })).toEqual(["Wien, AT"]);
  expect(addressLines(EMPTY_ADDRESS)).toEqual([]);
});

test("the Photon query is limited to the chosen country and to streets and houses", () => {
  const url = new URL(photonUrl("Hauptstr", "AT"));
  expect(url.searchParams.get("countrycode")).toBe("AT");
  expect(url.searchParams.getAll("layer")).toEqual(["house", "street"]);
});

test("suggestions keep a typed house number on a street hit and drop duplicates", () => {
  const street = {
    properties: { type: "street", name: "Unter den Linden", postcode: "10117", city: "Berlin" },
  };
  const house = {
    properties: {
      type: "house",
      street: "Unter den Linden",
      housenumber: "77",
      postcode: "10117",
      city: "Berlin",
      district: "Mitte",
    },
  };
  expect(toSuggestions([street, street, house], "Unter den Linden 5")).toEqual([
    { street: "Unter den Linden 5", postcode: "10117", city: "Berlin", district: "" },
    { street: "Unter den Linden 77", postcode: "10117", city: "Berlin", district: "Mitte" },
  ]);
  expect(toSuggestions([{ properties: { type: "street" } }], "x")).toEqual([]);
});
