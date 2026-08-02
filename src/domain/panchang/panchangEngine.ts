import { Body, EclipticGeoMoon, Observer, SearchRiseSet, SunPosition } from "astronomy-engine";
import type { LocationSettings, VerifiedContext, VerifiedPanchang } from "../../types/domain";
import { calculateDayPeriods } from "./dayPeriods";
import { lahiriAyanamsaDegrees, normalizeDegrees } from "./ayanamsa";
import { formatInTimezone, minutesInTimezone, zonedDateTimeToUtc } from "./timezone";

const TITHI_NAMES = ["Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi", "Purnima", "Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi", "Amavasya"];
const NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishtha", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
const YOGAS = ["Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"];
const RASHIS = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"];
const VARAS = ["Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara"];
const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"];

function longitudeFacts(date: Date) {
  const moonTropical = EclipticGeoMoon(date).lon;
  const sunTropical = SunPosition(date).elon;
  const ayanamsa = lahiriAyanamsaDegrees(date);
  const moonSidereal = normalizeDegrees(moonTropical - ayanamsa);
  const sunSidereal = normalizeDegrees(sunTropical - ayanamsa);
  const elongation = normalizeDegrees(moonTropical - sunTropical);
  const tithiIndex = Math.floor(elongation / 12) + 1;
  const nakshatraIndex = Math.floor(moonSidereal / (360 / 27)) + 1;
  const yogaIndex = Math.floor(normalizeDegrees(moonSidereal + sunSidereal) / (360 / 27)) + 1;
  const halfTithi = Math.floor(elongation / 6);
  let karana = "Kimstughna";
  if (halfTithi > 0 && halfTithi < 57) karana = MOVABLE_KARANAS[(halfTithi - 1) % 7] ?? "Unavailable";
  else if (halfTithi === 57) karana = "Shakuni";
  else if (halfTithi === 58) karana = "Chatushpada";
  else if (halfTithi === 59) karana = "Naga";
  return { moonSidereal, tithiIndex, nakshatraIndex, yogaIndex, karana };
}

function nextTransition(start: Date, selector: (date: Date) => number): Date | undefined {
  const initial = selector(start);
  let low = start.getTime();
  let high = low;
  for (let step = 1; step <= 72; step += 1) {
    high = start.getTime() + step * 30 * 60_000;
    if (selector(new Date(high)) !== initial) {
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const mid = Math.floor((low + high) / 2);
        if (selector(new Date(mid)) === initial) low = mid; else high = mid;
      }
      return new Date(high);
    }
    low = high;
  }
  return undefined;
}

export function calculatePanchang(date: string, location: LocationSettings, generatedAt = new Date()): VerifiedContext {
  const dayStart = zonedDateTimeToUtc(date, "00:00:00", location.timezone);
  const observer = new Observer(location.latitude, location.longitude, 0);
  const sunriseTime = SearchRiseSet(Body.Sun, observer, +1, dayStart, 1.5)?.date;
  const sunsetTime = SearchRiseSet(Body.Sun, observer, -1, dayStart, 1.5)?.date;
  const warnings = [
    "Astronomical positions use Astronomy Engine; traditional Panchang fields remain provisional until fixture validation is completed.",
    "Lahiri ayanamsa is an approximation in this release. Consult a trusted local Panchang for rituals requiring certified timing.",
  ];
  if (!sunriseTime || !sunsetTime) {
    return { date, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude, locationName: location.name, calculationMethod: "Astronomy Engine 2.x", ayanamsa: "Lahiri approximation (provisional)", sourceType: "local-calculation", warnings: [...warnings, "Sunrise or sunset was unavailable at this location/date."], panchang: { civilDate: date, vara: VARAS[dayStart.getUTCDay()] ?? "Unknown", transitions: [], validationStatus: "unavailable", unverifiedFields: ["sunrise", "sunset", "tithi", "nakshatra", "yoga", "karana", "moonRashi"] } };
  }

  const facts = longitudeFacts(sunriseTime);
  const tithiEnd = nextTransition(sunriseTime, (instant) => longitudeFacts(instant).tithiIndex);
  const nakshatraEnd = nextTransition(sunriseTime, (instant) => longitudeFacts(instant).nakshatraIndex);
  const dayPeriods = calculateDayPeriods(new Date(`${date}T12:00:00Z`).getUTCDay(), minutesInTimezone(sunriseTime, location.timezone), minutesInTimezone(sunsetTime, location.timezone));
  const tithiName = TITHI_NAMES[facts.tithiIndex - 1] ?? "Unavailable";
  const nakshatraName = NAKSHATRAS[facts.nakshatraIndex - 1] ?? "Unavailable";
  const panchang: VerifiedPanchang = {
    civilDate: date,
    vara: VARAS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "Unknown",
    sunrise: formatInTimezone(sunriseTime, location.timezone),
    sunset: formatInTimezone(sunsetTime, location.timezone),
    tithi: { index: facts.tithiIndex, name: tithiName, paksha: facts.tithiIndex <= 15 ? "Shukla" : "Krishna", endsAt: tithiEnd ? formatInTimezone(tithiEnd, location.timezone) : undefined },
    nakshatra: { index: facts.nakshatraIndex, name: nakshatraName, endsAt: nakshatraEnd ? formatInTimezone(nakshatraEnd, location.timezone) : undefined },
    yoga: { index: facts.yogaIndex, name: YOGAS[facts.yogaIndex - 1] ?? "Unavailable" },
    karana: { index: Math.floor(normalizeDegrees(EclipticGeoMoon(sunriseTime).lon - SunPosition(sunriseTime).elon) / 6) + 1, name: facts.karana },
    moonRashi: { index: Math.floor(facts.moonSidereal / 30) + 1, name: RASHIS[Math.floor(facts.moonSidereal / 30)] ?? "Unavailable" },
    ...dayPeriods,
    transitions: [
      ...(tithiEnd ? [{ field: "tithi", at: formatInTimezone(tithiEnd, location.timezone), from: tithiName, to: TITHI_NAMES[facts.tithiIndex % 30] ?? "Unavailable" }] : []),
      ...(nakshatraEnd ? [{ field: "nakshatra", at: formatInTimezone(nakshatraEnd, location.timezone), from: nakshatraName, to: NAKSHATRAS[facts.nakshatraIndex % 27] ?? "Unavailable" }] : []),
    ],
    validationStatus: "provisional",
    unverifiedFields: ["tithi", "nakshatra", "yoga", "karana", "moonRashi"],
  };
  return { date, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude, locationName: location.name, calculationMethod: "Astronomy Engine 2.x (VSOP87/NOVAS-derived) + Barve Guruji Panchang engine 0.1", ayanamsa: "Lahiri approximation (provisional)", sourceType: "local-calculation", sourceName: "Local deterministic engine", panchang, warnings: [...warnings, `Generated ${generatedAt.toISOString()}`] };
}
