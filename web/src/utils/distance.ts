// Free, no-API-key geocoding (OpenStreetMap Nominatim) + driving distance
// (public OSRM demo server). Both require internet — this is an online-only
// convenience layered on top of the offline-first app, not a replacement for
// manual expense entry, which still works with zero network.

export class DistanceError extends Error {}

interface GeoPoint {
  lat: number;
  lon: number;
  displayName: string;
}

async function geocode(address: string): Promise<GeoPoint> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new DistanceError(`Could not look up "${address}"`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (rows.length === 0) throw new DistanceError(`No location found for "${address}"`);
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), displayName: rows[0].display_name };
}

export interface DistanceResult {
  distanceKm: number;
  fromResolved: string;
  toResolved: string;
}

export async function calculateDrivingDistanceKm(fromAddress: string, toAddress: string): Promise<DistanceResult> {
  if (!fromAddress.trim() || !toAddress.trim()) {
    throw new DistanceError("Both from and to addresses are required");
  }

  const [from, to] = await Promise.all([geocode(fromAddress), geocode(toAddress)]);

  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(routeUrl);
  if (!res.ok) throw new DistanceError("Could not calculate the route between these addresses");
  const data = (await res.json()) as { code: string; routes?: { distance: number }[] };
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new DistanceError("No driving route found between these addresses");
  }

  return {
    distanceKm: data.routes[0].distance / 1000,
    fromResolved: from.displayName,
    toResolved: to.displayName,
  };
}
