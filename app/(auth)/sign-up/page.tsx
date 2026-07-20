import type { Metadata } from "next";
import { isDbBacked } from "@/lib/data";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: "Start a 14-day Foundly Growth trial — no credit card. Keep a free plan forever when it ends.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  const referralCode = (await searchParams).ref?.slice(0, 220);
  return <SignUpForm googleEnabled={googleEnabled} dbBacked={isDbBacked()} referralCode={referralCode} />;
}
