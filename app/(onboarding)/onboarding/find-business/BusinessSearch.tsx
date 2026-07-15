"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, Card, Input, Skeleton } from "@/components/ds";
import { Icon } from "@/components/icons";
import { updateLocationGoogleAction } from "@/lib/actions";

/**
 * Real Google business lookup for onboarding step 1.
 * - With a Places key: debounced text search → pick your listing → the
 *   Place ID (and real rating/review count) is saved to the workspace,
 *   wiring QR codes and review requests to the real "write a review" page.
 * - Without a key: an honest notice — no fake matches, no fake saving.
 */

interface PlaceHit {
  placeId: string;
  name: string;
  address: string;
  city: string;
  rating: number;
  reviewCount: number;
  category: string;
}

type SearchResponse =
  | { ok: true; places: PlaceHit[] }
  | { ok: false; reason: "no_key" | "error"; detail?: string };

export interface CurrentBusiness {
  name: string;
  address: string;
  city: string;
  category: string;
  placeId?: string;
  region: "US" | "CA";
}

export function BusinessSearch({
  placesEnabled,
  current,
}: {
  placesEnabled: boolean;
  current: CurrentBusiness;
}) {
  const [query, setQuery] = useState(current.placeId ? "" : current.name);
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [keyMissing, setKeyMissing] = useState(!placesEnabled);
  const [linked, setLinked] = useState<PlaceHit | null>(
    current.placeId
      ? {
          placeId: current.placeId,
          name: current.name,
          address: current.address,
          city: current.city,
          rating: 0,
          reviewCount: 0,
          category: current.category,
        }
      : null,
  );
  const [saving, startSaving] = useTransition();
  const runRef = useRef(0);

  // Debounced search — client only ever talks to our own API route.
  useEffect(() => {
    if (keyMissing || linked) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const myRun = ++runRef.current;
    setSearching(true);
    setSearchError(false);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/places/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, region: current.region }),
        });
        const data = (await res.json()) as SearchResponse;
        if (runRef.current !== myRun) return;
        if (data.ok) {
          setResults(data.places);
        } else if (data.reason === "no_key") {
          setKeyMissing(true);
        } else {
          setSearchError(true);
          setResults([]);
        }
      } catch {
        if (runRef.current === myRun) {
          setSearchError(true);
          setResults([]);
        }
      } finally {
        if (runRef.current === myRun) setSearching(false);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query, keyMissing, linked, current.region]);

  function selectPlace(place: PlaceHit) {
    startSaving(async () => {
      await updateLocationGoogleAction({
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        city: place.city,
        rating: place.rating,
        reviewCount: place.reviewCount,
        category: place.category || undefined,
      });
      setLinked(place);
      setResults([]);
    });
  }

  // ── Keyless: honest fallback, nothing pretends to match ──────────
  if (keyMissing) {
    return (
      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
              <Icon name="building" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-ink">{current.name}</div>
              <div className="mt-0.5 text-[13px] text-sub">
                {[current.address, current.city].filter(Boolean).join(", ") ||
                  "Address not set yet"}
              </div>
              <div className="mt-2">
                <Badge tone="neutral">From your sign-up details</Badge>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-gold-deep" />
          <span>
            Google lookup isn&apos;t configured yet — you can connect it later in Settings →
            Integrations. Until then we&apos;ll use the details above.
          </span>
        </div>
      </div>
    );
  }

  // ── Linked: real listing confirmed ────────────────────────────────
  if (linked) {
    return (
      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
              <Icon name="map-pin" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-[15px] font-bold text-ink">{linked.name}</div>
                <Badge tone="primary" icon="check">Linked</Badge>
              </div>
              <div className="mt-0.5 text-[13px] text-sub">{linked.address}</div>
              {linked.reviewCount > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
                    <Icon name="star-fill" size={14} className="text-star" />
                    {linked.rating.toFixed(1)}
                    <span className="font-normal text-faint">
                      · {linked.reviewCount} reviews
                    </span>
                  </span>
                  {linked.category ? <Badge tone="neutral">{linked.category}</Badge> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-btn bg-primary-wash px-3 py-2 text-[12px] text-sub">
            <Icon name="check-circle" size={15} className="shrink-0 text-primary" />
            This links your real Google review page — requests and QR codes now point there.
          </div>
        </Card>

        <button
          type="button"
          onClick={() => {
            setLinked(null);
            setQuery("");
            setResults([]);
          }}
          className="text-[13px] font-medium text-sub underline-offset-2 hover:text-ink hover:underline"
        >
          Not the right one? Search again
        </button>
      </div>
    );
  }

  // ── Live search ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Input
        iconLeft="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your business name"
        aria-label="Search for your business on Google"
        autoFocus
      />

      {searching ? (
        <Card className="space-y-3" aria-busy>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </Card>
      ) : null}

      {searchError ? (
        <div className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint px-3 py-2.5 text-[12px] text-danger">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          <span>Google lookup hit an error — check your connection and try again.</span>
        </div>
      ) : null}

      {!searching && results.length > 0 ? (
        <div className="space-y-2" role="list" aria-label="Matching businesses">
          {results.map((place) => (
            <button
              key={place.placeId}
              type="button"
              role="listitem"
              disabled={saving}
              onClick={() => selectPlace(place)}
              className="w-full rounded-card border border-hairline bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary-wash disabled:opacity-60"
            >
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
                  {saving ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon name="map-pin" size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink">{place.name}</div>
                  <div className="mt-0.5 truncate text-[13px] text-sub">{place.address}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {place.reviewCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
                        <Icon name="star-fill" size={14} className="text-star" />
                        {place.rating.toFixed(1)}
                        <span className="font-normal text-faint">
                          · {place.reviewCount} reviews
                        </span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-faint">No public reviews yet</span>
                    )}
                    {place.category ? <Badge tone="neutral">{place.category}</Badge> : null}
                  </div>
                </div>
                <Icon name="chevron-right" size={18} className="mt-1 shrink-0 text-faint" />
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {!searching && !searchError && query.trim().length >= 2 && results.length === 0 ? (
        <p className="text-[13px] text-faint">
          No matches on Google yet — try adding your city (e.g. &ldquo;{query.trim()} Toronto&rdquo;).
        </p>
      ) : null}

      <p className="text-[12px] text-faint">
        Results come from your public Google listing. Picking one wires review requests and QR
        codes to your real &ldquo;write a review&rdquo; page.
      </p>
    </div>
  );
}
