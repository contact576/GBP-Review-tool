"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Field, Input } from "@/components/ds/form";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";
import { formatRelative } from "@/lib/utils/format";
import {
  inviteAgencyClientOwnerAction,
  linkAgencyClientGoogleAction,
  removeAgencyClientAction,
  searchAgencyClientGoogleAction,
  syncAgencyClientAction,
  updateAgencyClientContactAction,
  type AgencyGooglePlace,
} from "@/lib/actions";

/**
 * Google listing: link (search → pick) and sync. Linking is a two-step
 * choice on purpose — Places always returns a confident best effort, and a
 * wrong match would put a stranger's rating on this client's report.
 */
export function ClientGooglePanel({
  clientId, clientName, city, linked, gbpConnected, rating, reviewCount, enabled,
}: {
  clientId: string;
  clientName: string;
  city: string;
  linked: boolean;
  gbpConnected: boolean;
  rating: number;
  reviewCount: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState(city ? `${clientName} ${city}` : clientName);
  const [places, setPlaces] = useState<AgencyGooglePlace[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [linking, startLink] = useTransition();
  const [syncing, startSync] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function search() {
    setMessage(null);
    startSearch(async () => {
      const result = await searchAgencyClientGoogleAction(clientId, query);
      if (!result.ok) {
        setMessage(result.error);
        setPlaces(null);
        return;
      }
      setPlaces(result.places);
      if (!result.places.length) setMessage("Google returned no listings for that search. Try adding the city or street.");
    });
  }

  function link(place: AgencyGooglePlace) {
    startLink(async () => {
      const result = await linkAgencyClientGoogleAction(clientId, place);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      setPlaces(null);
      setMessage(result.message);
      toast("Listing linked", "success", "check-circle");
      router.refresh();
    });
  }

  function sync() {
    setMessage(null);
    startSync(async () => {
      const result = await syncAgencyClientAction(clientId);
      setMessage(result.message);
      toast(result.ok ? "Synced from Google" : "Sync failed", result.ok ? "success" : "danger", result.ok ? "refresh" : "alert");
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        kicker="Google"
        title="Listing"
        action={
          linked ? (
            <Badge tone="primary" icon="check-circle">Linked</Badge>
          ) : (
            <Badge tone="gold" icon="alert">Not linked</Badge>
          )
        }
      />
      <div className="space-y-3 text-[13px] text-sub">
        {linked ? (
          <p>
            Matched to a Google listing: <span className="font-semibold text-ink">{rating.toFixed(1)}★</span> from{" "}
            <span className="font-semibold text-ink">{reviewCount}</span> reviews.{" "}
            {gbpConnected
              ? "The Business Profile is connected, so syncs import the full review history."
              : "Only public data syncs until the client's Business Profile is connected (open the workspace → Settings → Integrations)."}
          </p>
        ) : (
          <p>
            No Google listing is linked, so this client&rsquo;s rating, reviews and Growth Score cannot be measured.
            Search below and pick the right listing.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={linked ? "Re-link to a different listing" : "Find the listing on Google"}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Business name and city"
                maxLength={160}
                disabled={!enabled}
              />
            </Field>
          </div>
          <Button variant="secondary" icon="search" loading={searching} disabled={!enabled || linking} onClick={search}>
            Search
          </Button>
          {linked ? (
            <Button variant="primary" icon="refresh" loading={syncing} disabled={!enabled || linking} onClick={sync}>
              Sync now
            </Button>
          ) : null}
        </div>

        {places?.length ? (
          <ul className="divide-y divide-hairline rounded-card border border-hairline">
            {places.map((place) => (
              <li key={place.placeId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink">{place.name}</div>
                  <div className="truncate text-[12px] text-sub">
                    {place.address || place.city} · {place.category || "Business"} · {place.rating.toFixed(1)}★ ({place.reviewCount})
                  </div>
                </div>
                <Button size="sm" icon="check" loading={linking} disabled={!enabled} onClick={() => link(place)}>
                  Link this one
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {message ? <p role="status" className="text-[12px] font-medium text-sub">{message}</p> : null}
        {!enabled ? (
          <p className="flex items-start gap-1.5 text-[12px] text-faint">
            <Icon name="lock" size={13} className="mt-px shrink-0" /> Google actions are off for the demo and for
            unreadable clients.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Client access: the contact the agency reports to, and whether that person
 * can log in to their own workspace. Inviting mints a password-setup link.
 */
export function ClientAccessPanel({
  clientId, contactEmail, ownerEmail, ownerHasLogin, invitedAt, brandName, enabled,
}: {
  clientId: string;
  contactEmail?: string;
  ownerEmail?: string;
  ownerHasLogin: boolean;
  invitedAt?: string;
  brandName: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState(contactEmail ?? "");
  const [savingContact, startSaveContact] = useTransition();
  const [inviting, startInvite] = useTransition();
  const [notice, setNotice] = useState<{ text: string; link?: string } | null>(null);
  const dirty = email.trim().toLowerCase() !== (contactEmail ?? "").toLowerCase();

  function saveContact() {
    startSaveContact(async () => {
      const result = await updateAgencyClientContactAction(clientId, email);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast("Contact email saved", "success", "check-circle");
      router.refresh();
    });
  }

  function invite() {
    setNotice(null);
    startInvite(async () => {
      const result = await inviteAgencyClientOwnerAction(clientId);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      setNotice({ text: result.message, link: result.link });
      toast(result.emailed ? "Invitation sent" : "Invitation link ready", "success", "mail");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        kicker="Client access"
        title="Contact & login"
        action={
          ownerHasLogin ? (
            <Badge tone="primary" icon="check-circle">Has login</Badge>
          ) : invitedAt ? (
            <Badge tone="gold" icon="clock">Invited</Badge>
          ) : (
            <Badge tone="sub" icon="lock">No login yet</Badge>
          )
        }
      />
      <div className="space-y-3 text-[13px] text-sub">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Contact email" hint="Receives the branded report, and the invitation below.">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                disabled={!enabled}
              />
            </Field>
          </div>
          <Button variant="secondary" icon="check" loading={savingContact} disabled={!enabled || !dirty} onClick={saveContact}>
            Save
          </Button>
        </div>

        <div className="rounded-btn bg-primary-wash p-3">
          {ownerHasLogin ? (
            <p>
              <span className="font-semibold text-ink">{ownerEmail}</span> can sign in to this workspace directly. They
              see the same console you open from here.
            </p>
          ) : (
            <p>
              The client has no login of their own yet. Inviting sends {email.trim() || "the contact"} a one-time link to
              choose a password; they then sign in at Foundly and land in this workspace.
              {invitedAt ? ` Last invited ${formatRelative(invitedAt)}.` : ""}
            </p>
          )}
        </div>

        {!ownerHasLogin ? (
          <Button variant="primary" icon="mail" loading={inviting} disabled={!enabled || dirty || !email.trim()} onClick={invite}>
            {invitedAt ? "Send the invitation again" : `Invite ${email.trim() ? "the client" : "…"} as ${brandName}`}
          </Button>
        ) : null}
        {dirty && !ownerHasLogin ? (
          <p className="text-[12px] text-faint">Save the contact email before inviting.</p>
        ) : null}

        {notice ? (
          <div role="status" className="space-y-2 rounded-btn border border-primary/25 bg-primary-wash p-3 text-[12px] text-primary-dark">
            <p className="font-medium">{notice.text}</p>
            {notice.link ? (
              <code className="block select-all break-all rounded-chip bg-card px-2 py-1 text-[11px] text-ink">{notice.link}</code>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Remove the client — the workspace and everything in it. Typed confirmation. */
export function ClientDangerZone({
  clientId, clientName, enabled, orphan,
}: {
  clientId: string;
  clientName: string;
  enabled: boolean;
  orphan: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const matches = typed.trim().toLowerCase() === clientName.trim().toLowerCase();

  function remove() {
    start(async () => {
      const result = await removeAgencyClientAction(clientId, typed);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast(`${clientName} removed`, "info", "flag");
      router.push("/agency/clients");
      router.refresh();
    });
  }

  return (
    <Card className="border-danger/30">
      <CardHeader kicker="Danger zone" title={orphan ? "Remove this entry" : "Remove this client"} />
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-sub">
          <p>
            {orphan
              ? "Drops the entry from your book. The workspace is already gone."
              : "Deletes the client's workspace — customers, requests, reviews, integrations, logins — and drops them from your book. This cannot be undone."}
          </p>
          <Button variant="danger" icon="x" disabled={!enabled} onClick={() => setOpen(true)}>
            {orphan ? "Remove entry" : "Remove client"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={`Type ${clientName} to confirm`}>
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus maxLength={160} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" icon="x" loading={pending} disabled={!matches} onClick={remove}>
              {orphan ? "Remove entry" : "Delete workspace and remove"}
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
