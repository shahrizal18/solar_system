// src/physics/orbit.js
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const J2000_EPOCH = 2451545.0;

// Keplerian fallback (fast, reliable)
export function propagateOrbit(planet, daysSinceJ2000) {
  const { a, e, i, Ω, ω, M0 } = planet;
  const periodYears = Math.pow(a, 1.5);
  const n = 360 / (periodYears * 365.25);
  let M = (M0 + n * daysSinceJ2000) % 360;
  if (M < 0) M += 360;
  const Mrad = M * DEG2RAD;
  let E = Mrad;
  for (let k = 0; k < 10; k++) {
    const dE = (E - e * Math.sin(E) - Mrad) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E));
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);
  const Ωrad = Ω * DEG2RAD, iRad = i * DEG2RAD, ωrad = ω * DEG2RAD;
  const ωn = ωrad + nu;
  return {
    x: r * (Math.cos(Ωrad) * Math.cos(ωn) - Math.sin(Ωrad) * Math.sin(ωn) * Math.cos(iRad)),
    y: r * (Math.sin(Ωrad) * Math.cos(ωn) + Math.cos(Ωrad) * Math.sin(ωn) * Math.cos(iRad)),
    z: r * Math.sin(ωn) * Math.sin(iRad),
    r, nu, M, E
  };
}

// Heliocentric ephemeris (astronomy-engine)
export function getHeliocentricPosition(bodyName, daysSinceJ2000) {
  if (typeof astronomy === 'undefined') {
    console.warn('astronomy-engine not loaded. Falling back to Keplerian.');
    return null;
  }
  const jd = J2000_EPOCH + daysSinceJ2000;
  const pos = astronomy.planet(bodyName, jd, 'heliocentric');
  if (!pos) return null;
  
  const decRad = pos.dec * DEG2RAD;
  const raRad = pos.ra * DEG2RAD;
  return {
    x: pos.distance * Math.cos(decRad) * Math.cos(raRad),
    y: pos.distance * Math.sin(decRad),
    z: pos.distance * Math.cos(decRad) * Math.sin(raRad)
  };
}
