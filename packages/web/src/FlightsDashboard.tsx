import { useEffect, useState } from 'react';

type ProviderStatus = 'ready' | 'missing_credentials';

type Deal = {
  destination: string;
  destinationCity: string;
  country: string;
  region: 'europe' | 'north-america';
  departureDate: string;
  price: number;
  currency: string;
  airlineCodes: string[];
  lastUpdatedAt: string;
  baselinePrice: number | null;
  dropPercent: number | null;
};

type AlertRecord = {
  id: string;
  createdAt: string;
  route: string;
  region: string;
  price: number;
  currency: string;
  reason: string;
  departureDate: string;
};

type Summary = {
  origin: string;
  month: string;
  lastScanAt: string | null;
  nextScheduledScanAt: string | null;
  routeCount: number;
  deals: Deal[];
  alerts: AlertRecord[];
  configuredRegions: string[];
  providerStatus: ProviderStatus;
};

type HistoryPoint = {
  scannedAt: string;
  destination: string;
  departureDate: string;
  price: number;
  currency: string;
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatMoney(value: number, code: string) {
  if (code === 'USD') {
    return currency.format(value);
  }
  return `${value.toFixed(0)} ${code}`;
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not yet';
}

export function FlightsDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [scanStatus, setScanStatus] = useState<'idle' | 'running'>('idle');

  async function loadSummary() {
    setStatus('loading');
    try {
      const response = await fetch('/api/flights/summary');
      if (!response.ok) {
        throw new Error(`Summary request failed with ${response.status}`);
      }
      const next = (await response.json()) as Summary;
      setSummary(next);
      setSelected((current) => current ?? next.deals[0]?.destination ?? null);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function triggerScan() {
    setScanStatus('running');
    try {
      const response = await fetch('/api/flights/scan', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Scan request failed with ${response.status}`);
      }
      await loadSummary();
    } finally {
      setScanStatus('idle');
    }
  }

  useEffect(() => {
    loadSummary();
    const id = window.setInterval(() => {
      loadSummary();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/flights/history/${selected}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`History request failed with ${response.status}`);
        }
        return response.json() as Promise<HistoryPoint[]>;
      })
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [selected]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(180deg,_#06202a_0%,_#020617_60%,_#02030a_100%)] text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
        <header className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.4em] text-amber-300">PDX Fare Radar</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">
                Current nonstop international fares from Portland
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Daily local scans, fire-deal alerts, and a live board for the real current PDX international nonstop routes.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
                Provider: {summary?.providerStatus === 'ready' ? 'Amadeus configured' : 'Set AMADEUS_CLIENT_ID / SECRET'}
              </div>
              <button
                onClick={triggerScan}
                disabled={scanStatus === 'running'}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"
              >
                {scanStatus === 'running' ? 'Scanning fares...' : 'Run scan now'}
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Month" value={summary?.month ?? '...'} />
          <StatCard label="Routes watched" value={String(summary?.routeCount ?? 0)} />
          <StatCard label="Last scan" value={formatTime(summary?.lastScanAt ?? null)} />
          <StatCard label="Next scan" value={formatTime(summary?.nextScheduledScanAt ?? null)} />
        </section>

        {status === 'error' && (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm text-rose-200">
            Could not load the flight summary. Start the server and check your Amadeus credentials.
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.25fr,0.75fr]">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Cheapest current deals</h2>
                <p className="text-sm text-slate-400">Sorted by lowest discovered nonstop July fare.</p>
              </div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                {summary?.configuredRegions.join(' / ') || 'waiting'}
              </div>
            </div>

            <div className="grid gap-3">
              {summary?.deals.map((deal) => (
                <button
                  key={`${deal.destination}-${deal.departureDate}`}
                  onClick={() => setSelected(deal.destination)}
                  className={`grid gap-3 rounded-3xl border p-4 text-left transition ${
                    selected === deal.destination
                      ? 'border-amber-300/60 bg-amber-300/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {deal.destinationCity} <span className="text-slate-400">({deal.destination})</span>
                      </div>
                      <div className="text-sm text-slate-400">
                        {deal.country} • {deal.region} • depart {deal.departureDate}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-amber-200">
                        {formatMoney(deal.price, deal.currency)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {deal.dropPercent !== null
                          ? `${deal.dropPercent}% below baseline`
                          : 'Building baseline'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Airlines: {deal.airlineCodes.join(', ') || 'n/a'}</span>
                    <span>
                      Baseline:{' '}
                      {deal.baselinePrice !== null ? formatMoney(deal.baselinePrice, deal.currency) : 'n/a'}
                    </span>
                  </div>
                </button>
              ))}

              {summary && summary.deals.length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
                  No fares yet. Run a scan once credentials are configured.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-4">
              <h2 className="text-xl font-semibold text-white">Alert feed</h2>
              <div className="mt-4 grid gap-3">
                {summary?.alerts.map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-sm font-semibold text-white">{alert.route}</div>
                    <div className="mt-1 text-sm text-amber-200">
                      {formatMoney(alert.price, alert.currency)} on {alert.departureDate}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{alert.reason}</div>
                    <div className="mt-2 text-xs text-slate-500">{formatTime(alert.createdAt)}</div>
                  </div>
                ))}
                {summary && summary.alerts.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
                    Alerts will appear here after the first deal trigger.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-4">
              <h2 className="text-xl font-semibold text-white">History for {selected ?? 'route'}</h2>
              <div className="mt-4 grid gap-3">
                {history.map((point) => (
                  <div key={point.scannedAt} className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">{point.departureDate}</div>
                      <div className="text-xs text-slate-500">snapshot {formatTime(point.scannedAt)}</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-200">
                      {formatMoney(point.price, point.currency)}
                    </div>
                  </div>
                ))}
                {selected && history.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
                    This route does not have stored history yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-[0.35em] text-slate-500">{label}</div>
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
