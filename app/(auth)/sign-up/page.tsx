import type { Metadata } from "next";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: "Start a 14-day Foundly Growth trial — no credit card. Keep a free plan forever when it ends.",
};

export default function SignUpPage() {
  return <SignUpForm />;
}
