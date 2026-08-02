# Accuracy model

AI interpretation is not astronomical calculation. A convincing persona cannot make an unknown Tithi, Rashi or Muhurta exact, so Barve Guruji AI assigns evidence levels:

- **Level A:** deterministically calculated and validated local data
- **Level B:** content extracted from an uploaded trusted source
- **Level C:** data explicitly provided or confirmed by the user
- **Level D:** traditional interpretation and general educational knowledge
- **Level E:** unsupported or uncertain information

Only Levels A–C may supply exact chart/Panchang facts. Level D explains meanings and traditions. Level E must be named as uncertainty.

## Why birth time and place matter

Lagna and house positions depend on the local horizon, so exact time, latitude, longitude and timezone are essential. A small birth-time error can change Lagna or house cusps. Chandra Rashi normally means the Moon’s sidereal sign, never a Western sun-sign date range or a sign inferred from a name.

This release does not calculate a natal chart. It accepts structured content extracted from an uploaded chart only after the user corrects and confirms it. Dasha is used only when visible and confirmed; unreadable data remains absent.

## Validated versus provisional features

Validated implementation mechanics:

- IST and arbitrary IANA timezone civil-date resolution;
- today/tomorrow/उद्या/परवा parsing;
- sunrise/sunset calculation through Astronomy Engine;
- weekday and eight-part daylight division for Rahu Kaal, Yamaganda and Gulika;
- versioned Agni Vasa arithmetic and all remainder mappings;
- message-history de-duplication and alternating roles;
- schema/range validation for chart extraction;
- verified-context injection and missing-value warnings.

Provisional, pending external almanac fixtures:

- the Lahiri ayanamsa approximation;
- Tithi, Nakshatra, Yoga, Karana and Moon Rashi labels/transitions;
- traditional equivalence with Ruikar, Date or another regional Panchang.

Not available as exact calculation:

- natal Lagna and planetary houses;
- Vimshottari or other Dasha engines;
- current sidereal transit/Sade Sati engine;
- Shadbala;
- category-specific or personalised Muhurta selection;
- complex Vivah rules.

The UI must never replace one of these gaps with model-generated data.
