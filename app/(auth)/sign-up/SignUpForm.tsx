"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input, Select, Checkbox } from "@/components/ds/form";
import { Divider } from "@/components/ds/misc";
import { registerAction } from "@/lib/actions";
import type { Region } from "@/lib/data/types";

const TRIAL_POINTS = [
  "Full Growth plan, free for 14 days",
  "No credit card required to start",
  "Keep a free plan forever when it ends",
];

const INDUSTRIES: { key: string; label: string }[] = [
  { key: "restaurant", label: "Restaurant" },
  { key: "cafe", label: "Café" },
  { key: "salon", label: "Salon" },
  { key: "barber", label: "Barber" },
  { key: "spa", label: "Spa" },
  { key: "physiotherapy", label: "Physiotherapy" },
  { key: "dental", label: "Dental clinic" },
  { key: "medical_clinic", label: "Medical clinic" },
  { key: "general_contractor", label: "Contractor / renovation" },
  { key: "plumbing", label: "Plumbing" },
  { key: "electrician", label: "Electrician" },
  { key: "hvac", label: "HVAC" },
  { key: "auto_repair", label: "Auto repair" },
  { key: "real_estate", label: "Real estate" },
  { key: "law_firm", label: "Law firm" },
  { key: "accounting", label: "Accounting" },
  { key: "gym", label: "Gym" },
  { key: "photography", label: "Photography" },
  { key: "retail_store", label: "Retail store" },
  { key: "professional_services", label: "Other" },
];

// Matches Button variant="secondary" size="md" fullWidth — a plain <a> to the
// OAuth route, not a <button>.
const googleLinkClass =
  "inline-flex h-11 min-h-[44px] w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn border border-hairline bg-card px-4 text-[14px] font-semibold text-ink transition-all duration-150 hover:bg-primary-wash";

export function SignUpForm({
  googleEnabled,
  dbBacked,
}: {
  googleEnabled: boolean;
  dbBacked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [industryKey, setIndustryKey] = useState("restaurant");
  const [region, setRegion] = useState<Region>("CA");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeTips, setAgreeTips] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agreeTerms) {
      setTermsError(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await registerAction({
        name,
        email,
        password,
        businessName,
        industryKey,
        region,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/onboarding/find-business");
      router.refresh();
    });
  }

  return (
    <Card raised>
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-ink">
          Start your 14-day Growth trial
        </h1>
        <p className="mt-1 text-[14px] text-sub">No card. No catch. Cancel anytime.</p>
      </div>

      {/* Reverse-trial explainer */}
      <div className="mt-5 rounded-card border border-primary/25 bg-primary-wash p-4">
        <ul className="space-y-2">
          {TRIAL_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-[13px] font-medium text-ink">
              <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-primary" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      {!dbBacked ? (
        <div className="mt-4 flex items-start gap-2 rounded-btn border border-gold/30 bg-gold-tint px-3 py-2.5 text-[12px] font-medium text-gold-deep">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          Preview environment: accounts work fully but reset periodically until the database is
          connected.
        </div>
      ) : null}

      {googleEnabled ? (
        <a href="/api/auth/google" className={`${googleLinkClass} mt-5`}>
          <Icon name="google" size={18} />
          Sign up with Google
        </a>
      ) : (
        <div className="mt-5">
          <span aria-disabled="true" className={`${googleLinkClass} pointer-events-none opacity-50`}>
            <Icon name="google" size={18} />
            Sign up with Google
          </span>
          <p className="mt-1.5 text-center text-[12px] text-faint">
            Google sign-in not configured yet
          </p>
        </div>
      )}

      <div className="my-5 flex items-center gap-3">
        <Divider className="flex-1" />
        <span className="text-[12px] text-faint">or with email</span>
        <Divider className="flex-1" />
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint px-3 py-2.5 text-[13px] font-medium text-danger"
        >
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <form className="space-y-3" onSubmit={submit}>
        <Field label="Your name">
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Chen"
            iconLeft="users"
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            iconLeft="mail"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password" hint="8+ characters, letters and numbers">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              iconLeft="lock"
              autoComplete="new-password"
              className="pr-16"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-btn px-2.5 py-2 text-[12px] font-semibold text-sub transition-colors hover:text-ink"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
        <Field label="Business name">
          <Input
            name="businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Harbourview Physiotherapy"
            iconLeft="building"
            autoComplete="organization"
            required
          />
        </Field>
        <Field label="Industry">
          <Select
            name="industry"
            value={industryKey}
            onChange={(e) => setIndustryKey(e.target.value)}
          >
            {INDUSTRIES.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select
            name="country"
            value={region}
            onChange={(e) => setRegion(e.target.value === "US" ? "US" : "CA")}
          >
            <option value="CA">Canada</option>
            <option value="US">United States</option>
          </Select>
        </Field>

        {/* Consent — two separate, granular checkboxes */}
        <div className="space-y-3 rounded-card border border-hairline bg-paper p-4">
          <Checkbox
            checked={agreeTerms}
            onChange={(v) => {
              setAgreeTerms(v);
              if (v) setTermsError(false);
            }}
            label={
              <>
                I agree to the{" "}
                <Link href="/legal/terms" className="font-semibold text-primary underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/legal/privacy" className="font-semibold text-primary underline">
                  Privacy Policy
                </Link>
                .
              </>
            }
          />
          <Checkbox
            checked={agreeTips}
            onChange={setAgreeTips}
            label="Send me occasional product tips and updates (optional)."
          />
        </div>
        {termsError ? (
          <p className="text-[12px] text-danger" role="alert">
            Please accept the Terms and Privacy Policy to continue.
          </p>
        ) : null}

        <Button type="submit" fullWidth loading={pending}>
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-sub">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-primary hover:text-primary-dark">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
