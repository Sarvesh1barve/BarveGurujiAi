# Panchang validation status

## Engine selection

[Astronomy Engine](https://github.com/cosinekitty/astronomy) was selected after checking its MIT license, current upstream activity, JavaScript/browser build, documented approximately one-arcminute accuracy, and validation against NOVAS/JPL-derived data. It supplies geocentric ecliptic coordinates and location-aware rise/set events without runtime network access.

The application adds civil-timezone conversion, an explicitly provisional Lahiri approximation, angular division for Panchang fields, transition search, and daylight-period division.

## Fixture policy

No unlicensed Panchang tables or invented expected values are committed. As of v2.0.0, a trustworthy multi-season fixture set with explicit source pages has not been obtained. Therefore Tithi, Nakshatra, Yoga, Karana and Moon Rashi are shown as **provisional** and included in `unverifiedFields`.

Current automated tests cover:

- Asia/Kolkata midnight boundaries;
- IANA timezone conversion;
- winter Pune and summer London engine execution;
- sunrise availability and bounded Tithi/Nakshatra indices;
- Rahu Kaal daylight divisions;
- transition search execution across different seasons;
- Agni Vasa result mapping for every remainder.

These are invariant/implementation tests, not almanac equivalence fixtures.

## Required fixture format before promotion

Each future fixture must contain:

```json
{
  "date": "YYYY-MM-DD",
  "location": { "name": "", "latitude": 0, "longitude": 0, "timezone": "Area/City" },
  "expected": { "field": "value", "transition": "local date-time" },
  "source": { "name": "", "edition": "", "page": 0, "referenceUrl": "" },
  "notes": "Traditional method or ayanamsa differences"
}
```

Promotion requires Pune dates in different months/seasons, at least one non-Pune location, sunrise-boundary cases, timezone boundaries, Tithi transitions and Nakshatra transitions. A field can leave `unverifiedFields` only after tolerances and traditional differences are documented.

## User-facing fallback

For an unavailable field, the required message is: **“This value is not yet verified in the calculation engine.”** Gemini is not asked to supply a substitute.
