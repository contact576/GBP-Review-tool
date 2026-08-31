import { getData } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { QrFrame } from "@/components/app/QrFrame";
import { QrDownload } from "@/components/app/QrDownload";
import { ProgressMeter, StatTile } from "@/components/charts";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { qrDegradeStatus, qrOpenRate } from "@/lib/qr/status";
import { EmbedSnippet } from "./EmbedSnippet";
import { PrintKitButton } from "./PrintKitButton";
import { QrConfigurator } from "./QrConfigurator";
import Image from "next/image";
import Link from "next/link";
import type { ProfileSuggestion } from "@/lib/data/types";
import { isContentSuggestionPreview, suggestionToGenerationKind } from "@/lib/ai/content-studio";
import { suggestionStatusLabel } from "@/lib/suggestions/inbox";
import { ContentPreviewGenerator } from "./ContentPreviewGenerator";
import { ManualDraftCreator } from "./ManualDraftCreator";

export default async function StudioPage() {
  const data = await getData();
  const base = await appUrl();
  const shortBase = base.replace(/^https?:\/\//, "");
  const qrAssets = data.qrAssets ?? [];
  const locationQr = qrAssets.find((a) => a.scope === "location");
  const staffQrs = qrAssets.filter((a) => a.scope === "staff");
  const widget = (data.widgets ?? [])[0];
  const staffById = new Map(data.staff.map((s) => [s.id, s]));
  const contentSuggestions = (data.location.suggestionInbox ?? []).filter(
    (suggestion) => suggestionToGenerationKind(suggestion) !== null && suggestion.status !== "dismissed" && suggestion.status !== "applied",
  );
  const openAiConnected = Boolean(process.env.OPENAI_API_KEY);

  const scanUrl = (slug: string) => `${base}/q/${slug}`;
  const shortUrl = (slug: string) => `${shortBase}/q/${slug}`;

  const totalScans = qrAssets.reduce((sum, q) => sum + q.scans, 0);
  const totalOpens = qrAssets.reduce((sum, q) => sum + q.pageOpens, 0);
  const avgOpenRate = qrOpenRate(totalScans, totalOpens);

  // What the degrade promise can actually deliver for THIS workspace right now.
  const degrade = qrDegradeStatus({
    subscription: {
      status: data.subscription.status,
      currentPeriodEnd: data.subscription.currentPeriodEnd ?? null,
      trialEndsAt: data.subscription.trialEndsAt ?? null,
    },
    reviewUrl: data.location.reviewUrl,
  });

  return (
    <>
      {/* Print: hide the app chrome so the kit sheet is the only printed output. */}
      <style>{`@media print { aside, header, nav { display: none !important; } main { padding: 0 !important; } }`}</style>

      <div className="space-y-5 print:hidden">
        <PageHeader
          title="AI Content Studio"
          sub="Turn verified business evidence into exact, approval-ready Google posts, owner replies, and profile copy."
        />

        <Card raised>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-btn bg-primary text-white">
                <Icon name="sparkles" size={21} />
              </div>
              <div>
                <div className="kicker text-primary-dark">Evidence-grounded generation</div>
                <h2 className="mt-1 text-[19px] font-extrabold tracking-[-0.02em] text-ink">Create the next local growth asset</h2>
                <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-sub">
                  Foundly uses confirmed Google profile facts and linked audit evidence. Website or social conflicts are excluded until the owner confirms them.
                </p>
              </div>
            </div>
            <Badge tone={openAiConnected ? "primary" : "gold"} icon={openAiConnected ? "check-circle" : "alert"}>
              {openAiConnected ? "OpenAI connected" : "OpenAI setup required"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StudioGuardrail icon="shield" title="Verified facts only" text="Untrusted website and social text is treated as evidence, never as instructions." />
            <StudioGuardrail icon="eye" title="Exact preview first" text="The final text and generated image are shown before approval." />
            <StudioGuardrail icon="google" title="No automatic write" text="Generation prepares a draft; publishing remains a separate owner-approved action." />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Content queue"
            action={<Badge tone="neutral">{contentSuggestions.length} suggestions</Badge>}
          />
          <div className="mb-4">
            <ManualDraftCreator disabled={!openAiConnected} />
          </div>
          {contentSuggestions.length ? (
            <div className="space-y-4">
              {contentSuggestions.map((suggestion) => (
                <ContentSuggestionCard key={suggestion.id} suggestion={suggestion} openAiConnected={openAiConnected} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="sparkles"
              title="No content drafts are waiting"
              description="Start one above, or connect your Google Business Profile so the audit can propose evidence-backed ideas automatically."
            />
          )}
        </Card>

        <div className="border-t border-hairline pt-5" />
        <PageHeader
          title="QR & Widgets"
          sub="The tools that turn a happy visit into a review — printed, worn, and embedded."
        />

        {/* Location QR — split configurator with a pinned live preview */}
        <Card raised>
          {locationQr ? (
            <QrConfigurator
              scanUrl={scanUrl(locationQr.slug)}
              shortUrl={shortUrl(locationQr.slug)}
              title={locationQr.label}
              subtitle="Scan to leave us a quick review"
              svgId="qr-svg-location"
              filename={`foundly-qr-${locationQr.slug}`}
              scans={locationQr.scans}
              pageOpens={locationQr.pageOpens}
            />
          ) : (
            <EmptyState
              icon="qr"
              title="No location QR yet"
              description="It'll appear here once your location QR is configured."
            />
          )}
        </Card>

        {/* Per-staff QR cards */}
        <Card>
          <CardHeader title="Staff QR codes" />
          {staffQrs.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staffQrs.map((qr) => {
                const staff = qr.staffId ? staffById.get(qr.staffId) : undefined;
                return (
                  <div key={qr.id} className="rounded-card border border-hairline p-4">
                    <QrFrame
                      id={`qr-svg-${qr.id}`}
                      url={scanUrl(qr.slug)}
                      title={staff?.displayName ?? qr.label}
                      subtitle={qr.label}
                      shortUrl={shortUrl(qr.slug)}
                    />
                    <p className="sr-only">
                      {`QR code for ${staff?.displayName ?? qr.label}. It encodes the review link ${scanUrl(qr.slug)}.`}
                    </p>
                    <div className="mt-3">
                      <QrDownload
                        svgContainerId={`qr-svg-${qr.id}`}
                        filename={`foundly-qr-${qr.slug}`}
                      />
                    </div>
                    <div className="mt-3 flex justify-center gap-2">
                      <Badge tone="primary" icon="qr">
                        <span className="tabular-nums">{formatNumber(qr.scans)}</span> scans
                      </Badge>
                      <Badge tone="neutral" icon="eye">
                        <span className="tabular-nums">{formatNumber(qr.pageOpens)}</span> opens
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="qr"
              title="No staff QR codes yet"
              description="Add staff to generate their own personal review QR codes."
            />
          )}
        </Card>

        {/* Print kit */}
        <Card>
          <CardHeader
            kicker="Print kit"
            title="Print your QR kit"
            action={locationQr ? <PrintKitButton /> : undefined}
          />
          {locationQr ? (
            <>
              <p className="text-[14px] text-sub">
                Printing this page produces a ready-to-use kit with your live QR code — no PDF
                download, straight from your browser&apos;s print dialog.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2.5 rounded-card border border-hairline bg-primary-wash/40 p-3">
                  <Icon name="building" size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <div className="text-[14px] font-semibold text-ink">Counter card</div>
                    <p className="text-[12px] text-faint">Trim and stand at the front desk.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-card border border-hairline bg-primary-wash/40 p-3">
                  <Icon name="file" size={16} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <div className="text-[14px] font-semibold text-ink">Table tent</div>
                    <p className="text-[12px] text-faint">Fold along the dashed line so both sides stand.</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="py-2 text-[13px] text-faint">
              The print kit becomes available once your location QR is configured.
            </p>
          )}
        </Card>

        {/* Website widget — light code well with format tabs */}
        <Card>
          <CardHeader
            title="Review widget embed"
            action={
              widget ? (
                <span className="data-chip text-sub">
                  {formatNumber(widget.impressions)} views · {formatNumber(widget.clicks)} clicks
                </span>
              ) : undefined
            }
          />
          <EmbedSnippet
            base={base}
            slug={locationQr?.slug ?? qrAssets[0]?.slug ?? data.location.id}
            domain={widget?.domain ?? "your-site.com"}
          />
        </Card>

        {/* Degrade promise — states exactly what the scan endpoint does. */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-card border p-4",
            degrade.hasReviewTarget
              ? "border-primary/25 bg-primary-wash/50"
              : "border-gold/40 bg-gold-tint/50",
          )}
        >
          <div
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-btn text-white",
              degrade.hasReviewTarget ? "bg-primary" : "bg-gold-deep",
            )}
          >
            <Icon name={degrade.hasReviewTarget ? "shield" : "alert"} size={20} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-ink">
              {degrade.lapsed
                ? "Your printed codes are in their grace window"
                : degrade.hasReviewTarget
                  ? "If your plan lapses, your printed codes keep working"
                  : "Connect your Google review link to protect your printed codes"}
            </div>
            {degrade.hasReviewTarget ? (
              <p className="mt-0.5 text-[14px] leading-relaxed text-sub">
                A cancelled subscription is detected on the next scan — nothing to switch on. For{" "}
                <span className="tabular-nums">{degrade.graceDays}</span> days after your last paid
                period ends, every scan redirects straight to your public Google review page, so
                nothing needs reprinting. After that window, scans land on a plain
                &ldquo;this code isn&apos;t active&rdquo; page — never an error.
              </p>
            ) : (
              <p className="mt-0.5 text-[14px] leading-relaxed text-sub">
                We can only redirect lapsed codes to a Google review page we have on file, and
                yours is empty. Until you connect your Google Business Profile, scans after a
                lapse would land on the &ldquo;this code isn&apos;t active&rdquo; page instead.
              </p>
            )}
            {degrade.lapsed ? (
              <p className="mt-2 text-[13px] font-semibold text-ink">
                {degrade.graceEndsAt ? (
                  <>
                    Scans are redirecting to Google until{" "}
                    <span className="tabular-nums">{formatDate(degrade.graceEndsAt)}</span>
                    {typeof degrade.daysLeft === "number" ? (
                      <>
                        {" "}
                        (<span className="tabular-nums">{degrade.daysLeft}</span> days left).
                      </>
                    ) : (
                      "."
                    )}
                  </>
                ) : (
                  <>
                    We have no billing end date on file, so scans keep redirecting to Google until
                    one exists — we never cut the window short on a date we can&apos;t verify.
                  </>
                )}
              </p>
            ) : null}
            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              There is no per-code pause switch yet. A code stays live until the subscription is
              cancelled, or until that specific code is marked degraded in the database.
            </p>
          </div>
        </div>

        {/* Scan analytics — StatTiles + per-asset open-rate meters */}
        <Card>
          <CardHeader title="Scan analytics" />
          {qrAssets.length ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Code scans" value={totalScans} />
                <StatTile label="Review pages opened" value={totalOpens} />
                <StatTile
                  label="Avg open rate"
                  value={avgOpenRate === null ? "—" : `${avgOpenRate}%`}
                />
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
                <Icon name="shield" size={13} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  These count two different events. A <strong className="font-semibold text-sub">scan</strong> is
                  any hit on the code&apos;s short link — including phone camera previews, messaging
                  link unfurlers and link scanners. An{" "}
                  <strong className="font-semibold text-sub">open</strong> is only counted when a real
                  browser navigates in and is handed a live review page, so the rate below is a
                  genuine ratio rather than a number that is always 100%.
                </span>
              </p>

              <div className="mt-5 space-y-4">
                <div className="kicker">Open rate by asset</div>
                {qrAssets.map((qr) => {
                  const rate = qrOpenRate(qr.scans, qr.pageOpens);
                  return (
                    <div key={qr.id}>
                      <ProgressMeter
                        value={rate ?? 0}
                        max={100}
                        label={qr.label}
                        valueText={
                          rate === null
                            ? "No scans yet"
                            : `${formatNumber(qr.pageOpens)} of ${formatNumber(qr.scans)} · ${rate}%`
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              icon="chart"
              title="No scans yet"
              description="Scan counts appear here once your codes are in the wild."
            />
          )}
        </Card>
      </div>

      {/* Print-only kit sheet: counter card + table tent with the live QR. */}
      {locationQr ? (
        <section id="qr-print-sheet" className="hidden print:block">
          <div className="break-after-page pt-12">
            <div className="mb-6 text-center">
              <div className="kicker">Foundly print kit — counter card</div>
              <p className="mt-1 text-[12px] text-faint">Trim along the card edge and stand at reception.</p>
            </div>
            <QrFrame
              url={scanUrl(locationQr.slug)}
              title={`Enjoyed your visit to ${data.location.name}?`}
              subtitle="Scan to leave us a quick review"
              shortUrl={shortUrl(locationQr.slug)}
            />
          </div>

          <div className="pt-12">
            <div className="mb-6 text-center">
              <div className="kicker">Foundly print kit — table tent</div>
              <p className="mt-1 text-[12px] text-faint">Fold along the dashed line so both sides stand upright.</p>
            </div>
            <div className="mx-auto w-fit">
              <div className="rotate-180">
                <QrFrame
                  url={scanUrl(locationQr.slug)}
                  title={`Enjoyed your visit to ${data.location.name}?`}
                  subtitle="Scan to leave us a quick review"
                  shortUrl={shortUrl(locationQr.slug)}
                />
              </div>
              <div className="my-3 border-t-2 border-dashed border-hairline" aria-hidden="true" />
              <QrFrame
                url={scanUrl(locationQr.slug)}
                title={`Enjoyed your visit to ${data.location.name}?`}
                subtitle="Scan to leave us a quick review"
                shortUrl={shortUrl(locationQr.slug)}
              />
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function StudioGuardrail({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="rounded-card border border-hairline bg-paper p-3">
      <Icon name={icon} size={17} className="text-primary" />
      <div className="mt-2 text-[13px] font-bold text-ink">{title}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{text}</p>
    </div>
  );
}

function ContentSuggestionCard({ suggestion, openAiConnected }: { suggestion: ProfileSuggestion; openAiConnected: boolean }) {
  const preview = isContentSuggestionPreview(suggestion.proposedValue) ? suggestion.proposedValue : null;
  const isPost = suggestion.kind === "local_post";
  return (
    <article id={suggestion.id} className="scroll-mt-24 overflow-hidden rounded-card border border-hairline bg-card">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-9 place-items-center rounded-btn bg-primary-tint text-primary-dark">
              <Icon name={isPost ? "megaphone" : suggestion.kind === "owner_reply" ? "send" : "pencil"} size={17} />
            </span>
            <Badge tone="neutral">{suggestionStatusLabel(suggestion.status)}</Badge>
            <Badge tone={suggestion.risk === "high" ? "gold" : "primary"}>{suggestion.risk} risk</Badge>
          </div>
          <h3 className="mt-3 text-[17px] font-extrabold tracking-[-0.015em] text-ink">{suggestion.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-sub">{suggestion.rationale}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-faint">
            <span className="data-chip rounded-chip bg-paper px-2 py-1">{suggestion.evidenceIds.length} linked evidence {suggestion.evidenceIds.length === 1 ? "fact" : "facts"}</span>
            <span className="data-chip rounded-chip bg-paper px-2 py-1">Priority {suggestion.priorityScore}</span>
          </div>

          {preview ? (
            <div className="mt-4 rounded-card border border-primary/20 bg-primary-wash/45 p-4">
              {preview.headline ? <div className="text-[15px] font-bold text-ink">{preview.headline}</div> : null}
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-sub">{preview.body}</p>
              {preview.evidenceSummary.length ? (
                <ul className="mt-3 space-y-1 border-t border-primary/15 pt-3">
                  {preview.evidenceSummary.map((item) => (
                    <li key={item} className="flex gap-2 text-[11px] text-faint">
                      <Icon name="check" size={13} className="mt-0.5 shrink-0 text-primary" /> {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-btn border border-dashed border-hairline bg-paper p-3 text-[12px] leading-relaxed text-sub">
              {suggestion.blockers[0] ?? "Generate the exact draft before it can be approved."}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ContentPreviewGenerator
              suggestionId={suggestion.id}
              regenerate={Boolean(preview)}
              disabled={!openAiConnected}
              includeImage={isPost}
            />
            {preview ? (
              <Link href={`/app/this-week#${suggestion.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-btn bg-primary-dark px-3 text-[12px] font-bold text-white">
                Review approval <Icon name="arrow-right" size={14} />
              </Link>
            ) : null}
            {!openAiConnected ? <span className="text-[11px] font-medium text-danger">Connect OpenAI to generate this preview.</span> : null}
          </div>
        </div>

        <div className="relative min-h-[250px] border-t border-hairline bg-hero lg:border-l lg:border-t-0">
          {preview?.image ? (
            <Image
              src={preview.image.src}
              alt={preview.image.altText}
              fill
              unoptimized
              sizes="(min-width: 1024px) 35vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-8 text-center text-white">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-white/10 text-gold">
                  <Icon name={isPost ? "camera" : "file"} size={22} />
                </span>
                <div className="mt-3 text-[14px] font-bold">{isPost ? "Original post image preview" : "Exact text preview"}</div>
                <p className="mt-1 max-w-[28ch] text-[11px] leading-relaxed text-white/60">
                  {isPost ? "The generated image is private until this draft is approved." : "This content type is text-only and uses no generated image."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
