"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";

const LEN = 6;

export default function TwoFactorPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array.from({ length: LEN }, () => ""));
  const [pending, setPending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");
  const complete = code.length === LEN;

  function setAt(i: number, value: string) {
    const clean = value.replace(/\D/g, "");
    setDigits((prev) => {
      const next = [...prev];
      if (clean.length > 1) {
        // pasted / multi-char: spread across boxes
        for (let k = 0; k < LEN; k++) next[k] = clean[k] ?? "";
      } else {
        next[i] = clean;
      }
      return next;
    });
    if (clean && i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  function verify() {
    if (!complete) return;
    setPending(true);
    // Presentational only — a real build would validate the code here.
    router.push("/app");
  }

  return (
    <Card raised>
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-btn bg-primary-tint text-primary-dark">
          <Icon name="shield" size={24} />
        </div>
        <h1 className="mt-4 text-[24px] font-extrabold tracking-tight text-ink">Two-factor verification</h1>
        <p className="mt-1 text-[14px] text-sub">Enter the 6-digit code from your authenticator app.</p>
      </div>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <div className="flex justify-center gap-2" role="group" aria-label="6-digit verification code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={LEN}
              aria-label={`Digit ${i + 1}`}
              className={cn(
                "size-12 rounded-input border bg-card text-center text-[20px] font-bold text-ink transition-colors focus-visible:outline-none focus-visible:border-primary",
                d ? "border-primary" : "border-hairline",
              )}
            />
          ))}
        </div>

        <Button type="submit" fullWidth className="mt-6" disabled={!complete} loading={pending}>
          Verify
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-between text-[13px]">
        <button type="button" className="font-medium text-primary hover:text-primary-dark">Resend code</button>
        <Link href="/sign-in" className="font-medium text-sub hover:text-ink">Back to sign in</Link>
      </div>
    </Card>
  );
}
