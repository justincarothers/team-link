import fs from 'fs/promises';
import path from 'path';

type Region = 'europe' | 'north-america';

type DestinationConfig = {
  code: string;
  city: string;
  country: string;
  region: Region;
};

type OfferSummary = {
  destination: string;
  destinationCity: string;
  country: string;
  region: Region;
  departureDate: string;
  price: number;
  currency: string;
  airlineCodes: string[];
  deepLink?: string;
  lastUpdatedAt: string;
};

type RouteSnapshot = {
  destination: string;
  destinationCity: string;
  country: string;
  region: Region;
  cheapestOffer: OfferSummary | null;
  offersFound: number;
  scannedDates: number;
  errors: string[];
};

type ScanSnapshot = {
  scannedAt: string;
  month: string;
  origin: string;
  routes: RouteSnapshot[];
};

type AlertRecord = {
  id: string;
  createdAt: string;
  route: string;
  region: Region;
  price: number;
  currency: string;
  reason: string;
  departureDate: string;
};

type MonitorState = {
  origin: string;
  targetMonth: string;
  destinations: DestinationConfig[];
  scans: ScanSnapshot[];
  alerts: AlertRecord[];
  lastScanAt: string | null;
  lastAlertAt: string | null;
};

type MonitorSummary = {
  origin: string;
  month: string;
  lastScanAt: string | null;
  nextScheduledScanAt: string | null;
  routeCount: number;
  deals: Array<OfferSummary & { baselinePrice: number | null; dropPercent: number | null }>;
  alerts: AlertRecord[];
  configuredRegions: Region[];
  providerStatus: 'ready' | 'missing_credentials';
};

const DEFAULT_DESTINATIONS: DestinationConfig[] = [
  { code: 'YYC', city: 'Calgary', country: 'Canada', region: 'north-america' },
  { code: 'CUN', city: 'Cancun', country: 'Mexico', region: 'north-america' },
  { code: 'GDL', city: 'Guadalajara', country: 'Mexico', region: 'north-america' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', region: 'europe' },
  { code: 'FRA', city: 'Frankfurt', country: 'Germany', region: 'europe' },
  { code: 'KEF', city: 'Reykjavik', country: 'Iceland', region: 'europe' },
  { code: 'LHR', city: 'London', country: 'United Kingdom', region: 'europe' },
  { code: 'PVR', city: 'Puerto Vallarta', country: 'Mexico', region: 'north-america' },
  { code: 'SJD', city: 'Los Cabos', country: 'Mexico', region: 'north-america' },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', region: 'north-america' },
];

const DATA_FILE = path.resolve(process.cwd(), 'data/flights-monitor.json');
const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

function defaultTargetMonth(now = new Date()): string {
  const july = new Date(now.getFullYear(), 6, 1);
  const year = now <= july ? now.getFullYear() : now.getFullYear() + 1;
  return `${year}-07`;
}

function parseDestinations(input: string | undefined): DestinationConfig[] {
  if (!input?.trim()) {
    return DEFAULT_DESTINATIONS;
  }

  return input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, city, country, region] = entry.split(':').map((part) => part.trim());
      if (!code || !city || !country || !region) {
        throw new Error(
          'FLIGHT_MONITOR_DESTINATIONS entries must look like CODE:City:Country:region',
        );
      }
      const normalized = region.toLowerCase() as Region;
      if (!['europe', 'north-america'].includes(normalized)) {
        throw new Error(`Unsupported region "${region}" for destination ${code}`);
      }
      return { code: code.toUpperCase(), city, country, region: normalized };
    });
}

function buildMonthDates(targetMonth: string): string[] {
  const [year, month] = targetMonth.split('-').map(Number);
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));

  while (cursor.getUTCMonth() === month - 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function percentageDrop(current: number, baseline: number | null): number | null {
  if (!baseline || baseline <= 0) return null;
  return Number((((baseline - current) / baseline) * 100).toFixed(1));
}

class AmadeusClient {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly clientId: string | undefined,
    private readonly clientSecret: string | undefined,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Missing Amadeus credentials');
    }
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Amadeus auth failed with ${response.status}`);
    }

    const payload = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = payload.access_token;
    this.expiresAt = Date.now() + payload.expires_in * 1000;
    return payload.access_token;
  }

  async searchNonstopOffers(
    origin: string,
    destination: DestinationConfig,
    departureDate: string,
  ): Promise<OfferSummary[]> {
    const token = await this.getToken();
    const params = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination.code,
      departureDate,
      adults: '1',
      nonStop: 'true',
      max: '10',
      currencyCode: process.env.FLIGHT_MONITOR_CURRENCY || 'USD',
    });

    const response = await fetch(
      `https://test.api.amadeus.com/v2/shopping/flight-offers?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Flight search failed for ${destination.code} on ${departureDate}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{
        price?: { total?: string; currency?: string };
        itineraries?: Array<{ segments?: Array<{ carrierCode?: string }> }>;
      }>;
    };

    const now = new Date().toISOString();
    return (payload.data ?? [])
      .map((offer) => {
        const total = toNumber(offer.price?.total);
        if (total === null) return null;
        const airlines = new Set<string>();
        for (const itinerary of offer.itineraries ?? []) {
          for (const segment of itinerary.segments ?? []) {
            if (segment.carrierCode) airlines.add(segment.carrierCode);
          }
        }

        return {
          destination: destination.code,
          destinationCity: destination.city,
          country: destination.country,
          region: destination.region,
          departureDate,
          price: total,
          currency: offer.price?.currency || 'USD',
          airlineCodes: [...airlines],
          lastUpdatedAt: now,
        } satisfies OfferSummary;
      })
      .filter((offer): offer is OfferSummary => Boolean(offer))
      .sort((a, b) => a.price - b.price);
  }
}

async function readState(destinations: DestinationConfig[], origin: string, targetMonth: string) {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as MonitorState;
    return {
      ...parsed,
      origin,
      targetMonth,
      destinations,
    } satisfies MonitorState;
  } catch {
    return {
      origin,
      targetMonth,
      destinations,
      scans: [],
      alerts: [],
      lastScanAt: null,
      lastAlertAt: null,
    } satisfies MonitorState;
  }
}

async function writeState(state: MonitorState) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function sendAlertWebhook(alert: AlertRecord, offer: OfferSummary) {
  const webhookUrl = process.env.FLIGHT_MONITOR_WEBHOOK_URL;
  if (!webhookUrl) return;

  const line = [
    `Fire deal from PDX to ${offer.destinationCity} (${offer.destination})`,
    `${offer.price} ${offer.currency}`,
    `depart ${offer.departureDate}`,
    alert.reason,
  ].join(' | ');

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: line,
      route: alert.route,
      price: alert.price,
      departureDate: alert.departureDate,
      reason: alert.reason,
      offer,
    }),
  }).catch(() => undefined);
}

export function createFlightMonitor() {
  const origin = (process.env.FLIGHT_MONITOR_ORIGIN || 'PDX').toUpperCase();
  const targetMonth = process.env.FLIGHT_MONITOR_MONTH || defaultTargetMonth();
  const destinations = parseDestinations(process.env.FLIGHT_MONITOR_DESTINATIONS);
  const absoluteDealThreshold = toNumber(process.env.FLIGHT_MONITOR_DEAL_PRICE_MAX) ?? 650;
  const dropThresholdPercent = toNumber(process.env.FLIGHT_MONITOR_DROP_PERCENT) ?? 20;
  const scheduleHour = toNumber(process.env.FLIGHT_MONITOR_SCAN_HOUR_LOCAL) ?? 6;
  const amadeus = new AmadeusClient(
    process.env.AMADEUS_CLIENT_ID,
    process.env.AMADEUS_CLIENT_SECRET,
  );

  let statePromise = readState(destinations, origin, targetMonth);
  let nextScheduledScanAt: string | null = null;
  let runningScan: Promise<ScanSnapshot> | null = null;

  async function getState() {
    return statePromise;
  }

  async function saveState(nextState: MonitorState) {
    statePromise = Promise.resolve(nextState);
    await writeState(nextState);
  }

  function hasRecentMatchingAlert(state: MonitorState, offer: OfferSummary) {
    return state.alerts.some((alert) =>
      alert.route === `${state.origin}-${offer.destination}`
      && alert.departureDate === offer.departureDate
      && alert.price === offer.price,
    );
  }

  function getHistoricalPrices(destination: string, scans: ScanSnapshot[]): number[] {
    const prices: number[] = [];
    for (const scan of scans) {
      const route = scan.routes.find((item) => item.destination === destination);
      if (route?.cheapestOffer) {
        prices.push(route.cheapestOffer.price);
      }
    }
    return prices;
  }

  async function runScan(): Promise<ScanSnapshot> {
    if (runningScan) return runningScan;

    runningScan = (async () => {
      const currentState = await getState();
      if (!amadeus.isConfigured()) {
        throw new Error('Amadeus credentials are missing');
      }

      const dates = buildMonthDates(currentState.targetMonth);
      const routes: RouteSnapshot[] = [];
      const newAlerts: AlertRecord[] = [];

      for (const destination of currentState.destinations) {
        const offers: OfferSummary[] = [];
        const errors: string[] = [];

        for (const departureDate of dates) {
          try {
            const results = await amadeus.searchNonstopOffers(currentState.origin, destination, departureDate);
            if (results[0]) {
              offers.push(results[0]);
            }
          } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown fetch error');
          }
        }

        const cheapestOffer = offers.sort((a, b) => a.price - b.price)[0] ?? null;
        routes.push({
          destination: destination.code,
          destinationCity: destination.city,
          country: destination.country,
          region: destination.region,
          cheapestOffer,
          offersFound: offers.length,
          scannedDates: dates.length,
          errors,
        });

        if (cheapestOffer) {
          const historicalPrices = getHistoricalPrices(destination.code, currentState.scans);
          const previousMedian = median(historicalPrices);
          const previousLow = historicalPrices.length > 0 ? Math.min(...historicalPrices) : null;
          const dropPct = percentageDrop(cheapestOffer.price, previousMedian);
          const newLow = previousLow !== null && cheapestOffer.price < previousLow;

          if (
            !hasRecentMatchingAlert(currentState, cheapestOffer)
            && (
              cheapestOffer.price <= absoluteDealThreshold
              || (dropPct !== null && dropPct >= dropThresholdPercent)
              || newLow
            )
          ) {
            const alert: AlertRecord = {
              id: `${destination.code}-${cheapestOffer.departureDate}-${Date.now()}`,
              createdAt: new Date().toISOString(),
              route: `${currentState.origin}-${destination.code}`,
              region: destination.region,
              price: cheapestOffer.price,
              currency: cheapestOffer.currency,
              reason: cheapestOffer.price <= absoluteDealThreshold
                ? `below ${absoluteDealThreshold} ${cheapestOffer.currency}`
                : newLow
                  ? 'new historical low'
                  : `${dropPct}% below trailing median`,
              departureDate: cheapestOffer.departureDate,
            };
            newAlerts.push(alert);
            await sendAlertWebhook(alert, cheapestOffer);
          }
        }
      }

      const snapshot: ScanSnapshot = {
        scannedAt: new Date().toISOString(),
        month: currentState.targetMonth,
        origin: currentState.origin,
        routes,
      };

      const nextState: MonitorState = {
        ...currentState,
        scans: [...currentState.scans, snapshot].slice(-90),
        alerts: [...newAlerts, ...currentState.alerts].slice(0, 100),
        lastScanAt: snapshot.scannedAt,
        lastAlertAt: newAlerts[0]?.createdAt ?? currentState.lastAlertAt,
      };

      await saveState(nextState);
      return snapshot;
    })();

    try {
      return await runningScan;
    } finally {
      runningScan = null;
    }
  }

  function scheduleNextScan() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(scheduleHour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    nextScheduledScanAt = next.toISOString();
    setTimeout(() => {
      runScan().catch((error) => {
        console.error('[flights] scheduled scan failed', error);
      }).finally(() => {
        scheduleNextScan();
      });
    }, Math.min(next.getTime() - now.getTime(), SCAN_INTERVAL_MS));
  }

  async function getSummary(): Promise<MonitorSummary> {
    const state = await getState();
    const latestScan = state.scans.at(-1);
    const deals = (latestScan?.routes ?? [])
      .filter((route) => route.cheapestOffer)
      .map((route) => {
        const historicalPrices = getHistoricalPrices(route.destination, state.scans.slice(0, -1));
        const baselinePrice = median(historicalPrices);
        const cheapestOffer = route.cheapestOffer!;
        return {
          ...cheapestOffer,
          baselinePrice,
          dropPercent: percentageDrop(cheapestOffer.price, baselinePrice),
        };
      })
      .sort((a, b) => a.price - b.price);

    return {
      origin: state.origin,
      month: state.targetMonth,
      lastScanAt: state.lastScanAt,
      nextScheduledScanAt,
      routeCount: state.destinations.length,
      deals,
      alerts: state.alerts.slice(0, 20),
      configuredRegions: [...new Set(state.destinations.map((item) => item.region))],
      providerStatus: amadeus.isConfigured() ? 'ready' : 'missing_credentials',
    };
  }

  async function getHistory(destination: string) {
    const state = await getState();
    return state.scans
      .map((scan) => {
        const route = scan.routes.find((item) => item.destination === destination.toUpperCase());
        return route?.cheapestOffer
          ? {
              scannedAt: scan.scannedAt,
              destination: route.destination,
              departureDate: route.cheapestOffer.departureDate,
              price: route.cheapestOffer.price,
              currency: route.cheapestOffer.currency,
            }
          : null;
      })
      .filter((point): point is {
        scannedAt: string;
        destination: string;
        departureDate: string;
        price: number;
        currency: string;
      } => Boolean(point));
  }

  async function getLatestRoutes() {
    const state = await getState();
    return state.scans.at(-1)?.routes ?? [];
  }

  function start() {
    scheduleNextScan();
    if (process.env.FLIGHT_MONITOR_RUN_ON_START === 'true') {
      runScan().catch((error) => {
        console.error('[flights] startup scan failed', error);
      });
    }
  }

  return {
    start,
    runScan,
    getSummary,
    getHistory,
    getLatestRoutes,
  };
}
