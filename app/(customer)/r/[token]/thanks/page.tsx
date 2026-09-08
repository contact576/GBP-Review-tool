import { findRequestByToken } from "@/lib/data";
import { Confetti } from "@/components/review/Confetti";
import { ThanksPanel } from "./ThanksPanel";

export default async function ThanksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await findRequestByToken(token);
  const business = result?.location.name ?? "the business";

  return (
    <>
      <Confetti fire />
      <ThanksPanel token={token} business={business} reviewUrl={result?.location.reviewUrl ?? "#"} />
    </>
  );
}
