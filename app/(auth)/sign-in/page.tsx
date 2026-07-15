import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Foundly, or explore a clearly-labeled demo as an owner, agency, or admin.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : undefined;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);
  return <SignInForm next={safeNext} googleEnabled={googleEnabled} />;
}
