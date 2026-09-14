"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day greeting. The server has no idea what time it is where the
 * owner sits, so it renders the neutral form and the client refines it once
 * mounted — never a hydration mismatch, never "Good morning" at 9pm.
 */
export function Greeting({ name }: { name: string }) {
  const [salutation, setSalutation] = useState<string | null>(null);
  useEffect(() => {
    const hour = new Date().getHours();
    setSalutation(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <span suppressHydrationWarning>
      {salutation ?? "Welcome back"}, {name}
    </span>
  );
}
