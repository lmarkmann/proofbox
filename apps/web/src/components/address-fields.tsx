import { MapPinIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Address,
  type AddressSuggestion,
  COUNTRIES,
  countryName,
  suggestAddresses,
} from "@/lib/address";

const SUGGEST_AFTER_CHARS = 3;
const SUGGEST_DEBOUNCE_MS = 250;
const COUNTRY_ITEMS = COUNTRIES.map((code) => ({ value: code, label: countryName(code) }));

function useAddressSuggestions(street: string, country: string) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  useEffect(() => {
    const query = street.trim();
    if (query.length < SUGGEST_AFTER_CHARS) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      suggestAddresses(query, country, controller.signal)
        .then(setSuggestions)
        // suggestions only speed typing up; without them the fields still take any address
        .catch(() => undefined);
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [street, country]);
  return suggestions;
}

/** Recipient and address as separate fields; the street suggests real addresses in the chosen country. */
export function AddressFields({
  address,
  onChange,
}: {
  address: Address;
  onChange: (update: (current: Address) => Address) => void;
}) {
  const suggestions = useAddressSuggestions(address.street, address.country);
  const set = (field: keyof Address) => (value: string) =>
    onChange((current) => ({ ...current, [field]: value }));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Ship to</legend>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipient" className="text-xs text-muted-foreground">
          Name or company
        </Label>
        <Input
          id="recipient"
          autoComplete="off"
          placeholder="Acme GmbH"
          maxLength={40}
          value={address.recipient}
          onChange={(event) => set("recipient")(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="country" className="text-xs text-muted-foreground">
          Country
        </Label>
        <Select
          items={COUNTRY_ITEMS}
          value={address.country}
          onValueChange={(code) => code && set("country")(code)}
        >
          <SelectTrigger id="country" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {COUNTRY_ITEMS.map((country) => (
              <SelectItem key={country.value} value={country.value}>
                {country.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="street" className="text-xs text-muted-foreground">
          Street and number
        </Label>
        <Combobox<AddressSuggestion>
          items={suggestions}
          filter={null}
          autoHighlight
          inputValue={address.street}
          onInputValueChange={set("street")}
          itemToStringLabel={(suggestion) => suggestion.street}
          onValueChange={(picked) => {
            if (!picked) return;
            onChange((current) => ({
              ...current,
              street: picked.street,
              postcode: picked.postcode || current.postcode,
              city: picked.city || current.city,
            }));
          }}
        >
          <ComboboxInput
            id="street"
            autoComplete="off"
            placeholder={`Start typing a street in ${countryName(address.country)}`}
            maxLength={40}
            showTrigger={false}
            className="w-full"
          />
          <ComboboxContent className={suggestions.length === 0 ? "hidden" : undefined}>
            <ComboboxList>
              {(suggestion: AddressSuggestion) => (
                <ComboboxItem
                  key={`${suggestion.street}|${suggestion.postcode}|${suggestion.city}`}
                  value={suggestion}
                  className="items-start py-1.5"
                >
                  <MapPinIcon className="mt-0.5 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{suggestion.street}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[suggestion.postcode, suggestion.city].filter(Boolean).join(" ")}
                      {suggestion.district && `, ${suggestion.district}`}
                    </span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="postcode" className="text-xs text-muted-foreground">
            Postcode
          </Label>
          <Input
            id="postcode"
            autoComplete="off"
            inputMode="text"
            placeholder="10117"
            maxLength={10}
            className="tabular-nums"
            value={address.postcode}
            onChange={(event) => set("postcode")(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city" className="text-xs text-muted-foreground">
            City
          </Label>
          <Input
            id="city"
            autoComplete="off"
            placeholder="Berlin"
            maxLength={30}
            value={address.city}
            onChange={(event) => set("city")(event.target.value)}
          />
        </div>
      </div>
    </fieldset>
  );
}
