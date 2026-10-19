/**
 * Sunrise and sunset for one place, computed locally.
 *
 * The app needs exactly one decision — is the sun up? — so this is a compact
 * solar-position calculation rather than a library or a network call. It runs
 * on the client, works offline, and needs no API key.
 */

/** The school's approximate coordinates. Only the sun cares about these. */
export const PLACE = { lat: 40.8448, lng: -73.8648 } as const

export type Place = { lat: number; lng: number }

const RAD = Math.PI / 180

/**
 * Solar elevation in degrees, using the standard low-precision solar position
 * formula (NOAA). Accurate to roughly a minute of sunrise/sunset time, which is
 * far finer than a theme switch needs.
 */
export function solarElevation(date: Date, place: Place = PLACE): number {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0
  const meanLongitude = (280.46 + 0.9856474 * n) % 360
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * RAD
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD
  const obliquity = (23.439 - 0.0000004 * n) * RAD

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  )
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude))

  let siderealTime = (18.697374558 + 24.06570982441908 * n) % 24
  if (siderealTime < 0) siderealTime += 24
  const hourAngle = (siderealTime + place.lng / 15) * 15 * RAD - rightAscension

  const latitude = place.lat * RAD
  const sinElevation =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)

  // Guard the input: rounding can push it a hair outside asin's domain.
  return Math.asin(Math.max(-1, Math.min(1, sinElevation))) / RAD
}

export interface SunWindow {
  /** Minutes after local midnight, or null when the sun never rises. */
  rise: number | null
  /** Minutes after local midnight, or null when the sun never sets. */
  set: number | null
}

/**
 * First and last minute of the local day with the sun above the horizon.
 * A minute-by-minute sweep is simpler to trust than closed-form hour angles at
 * these latitudes, and 1440 cheap evaluations cost well under a millisecond.
 */
export function sunWindow(day: Date, place: Place = PLACE): SunWindow {
  const year = day.getFullYear()
  const month = day.getMonth()
  const date = day.getDate()

  let rise: number | null = null
  let set: number | null = null

  for (let minute = 0; minute < 1440; minute += 1) {
    // -0.833° accounts for refraction and the sun's radius — the usual
    // definition of "the sun is up".
    if (solarElevation(new Date(year, month, date, 0, minute), place) > -0.833) {
      if (rise === null) rise = minute
      set = minute
    }
  }

  return { rise, set }
}

/** True while the sun is above the horizon at `now`. */
export function isDaylight(now: Date, place: Place = PLACE): boolean {
  const minuteNow = now.getHours() * 60 + now.getMinutes()
  const { rise, set } = sunWindow(now, place)
  if (rise === null || set === null) return false
  return minuteNow >= rise && minuteNow <= set
}
