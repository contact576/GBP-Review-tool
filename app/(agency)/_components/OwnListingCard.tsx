"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { enterOwnWorkspaceAction } from "@/lib/actions";

/**
 * The agency's OWN Google listing. The agency console is about clients, so
 * the agency's own workspace was unreachable from it — this card opens it
 * (same acting mechanism as a client, pointed at home) so the agency can
 * connect Google, sync and edit its business details.
 */
export function OwnListingCard({
  name, city, rating, reviewCount, linked, gbpConnected, canOpen,
}: {
  name: string;
  city: string;
  rating: number;
  reviewCount: number;
  linked: boolean;
  gbpConnected: boolean;
  canOpen: boolean;
}) {
  const [opening, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    start(async () => {
      const result = await enterOwnWorkspaceAction();
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader
        kicker="Your own listing"
        title={name}
        action={
          gbpConnected ? (
            <Badge tone="primary" icon="check-circle">Profile connected</Badge>
          ) : linked ? (
            <Badge tone="gold" icon="google">Listing linked</Badge>
          ) : (
            <Badge tone="sub" icon="alert">Not linked</Badge>
          )
        }
      />
      <div className="space-y-3 text-[13px] text-sub">
        <p>
          {linked ? (
            <>
              <span className="font-semibold text-ink">{rating.toFixed(1)}★</span> from{" "}
              <span className="font-semibold text-ink">{reviewCount}</span> Google reviews{city ? ` · ${city}` : ""}.
              {gbpConnected
                ? " Reviews and profile changes sync from your Business Profile."
                : " Connect your Business Profile to import the full review history and manage the profile."}
            </>
          ) : (
            "Your own workspace has no Google listing linked yet — your agency's reviews are not being tracked."
          )}
        </p>
        <Button variant="secondary" icon="building" fullWidth loading={opening} disabled={!canOpen} onClick={open}>
          Open my workspace
        </Button>
        <p className="flex items-start gap-1.5 text-[12px] text-faint">
          <Icon name="lock" size={13} className="mt-px shrink-0" />
          {canOpen
            ? "Connect Google, sync, and edit business details as the agency. A banner brings you back here."
            : "Available to the agency admin on a real account."}
        </p>
        {error ? <p role="status" className="text-[12px] font-medium text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}
