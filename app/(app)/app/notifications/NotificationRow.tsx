"use client";

/**
 * One notification, as a link to the record it is about.
 *
 * Following the link marks that single notification read — the whole list is
 * only cleared by the explicit "Mark all read" control, so opening one item
 * never silently discards the others.
 */
import Link from "next/link";
import { useTransition } from "react";
import { Icon, type IconName } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { markNotificationReadAction } from "@/lib/actions";
import { notificationDestination } from "@/lib/notifications/destination";
import type { Notification } from "@/lib/data/types";

const KIND_ICON: Record<Notification["kind"], IconName> = {
  review: "star",
  feedback: "chat",
  delivery: "send",
  milestone: "trophy",
  system: "bell",
};

export function NotificationRow({ notification }: { notification: Notification }) {
  const [, start] = useTransition();
  const destination = notificationDestination(notification.kind);

  return (
    <Link
      href={destination.href}
      onClick={() => {
        // Fire-and-forget: navigation must not wait on the write, and a failed
        // write simply leaves the row unread rather than blocking the owner.
        if (!notification.read) start(() => markNotificationReadAction(notification.id));
      }}
      className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-primary-wash/60 ${
        notification.read ? "" : "bg-primary-wash/40"
      }`}
    >
      <div className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
        <Icon name={KIND_ICON[notification.kind]} size={17} />
        {!notification.read ? (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card"
            aria-label="Unread"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-[15px] ${notification.read ? "font-semibold text-sub" : "font-bold text-ink"}`}
          >
            {notification.title}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-faint">
            {formatRelative(notification.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-[14px] text-sub">{notification.body}</p>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-dark">
          {destination.label}
          <Icon
            name="chevron-right"
            size={13}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}
