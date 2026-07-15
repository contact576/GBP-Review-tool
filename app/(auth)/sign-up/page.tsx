import type { Metadata } from "next";
import { isDbBacked } from "@/lib/data";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: "Start a 14-day Foundly Growth trial — no credit card. Keep a free plan forever when it ends.",
};

export default function SignUpPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  return <SignUpForm googleEnabled={googleEnabled} dbBacked={isDbBacked()} />;
}
