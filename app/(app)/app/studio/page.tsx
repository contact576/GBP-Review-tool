import { getData } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { QrFrame } from "@/components/app/QrFrame";
import { QrDownload } from "@/components/app/QrDownload";
import { ProgressMeter, StatTile } from "@/components/charts";
import { formatNumber } from "@/lib/utils/format";
import { EmbedSnippet } from "./EmbedSnippet";
import { PrintKitButton } from "./PrintKitButton";
import { QrConfigurator } from "./QrConfigurator";

export default async function StudioPage() {
  const data = await getData();
  const base = await appUrl();
  const shortBase = base.replace(/^https?:\/\//, "");
  const qrAssets = data.qrAssets ?? [];
  const locationQr = qrAssets.find((a) => a.scope === "location");
  const staffQrs = qrAssets.filter((a) => a.scope === "staff");
  const widget = (data.widgets ?? [])[0];
  const staffById = new Map(data.staff.map((s) => [s.id, s]));

  const scanUrl = (slug: string) => `${base}/q/${slug}`;
  const shortUrl = (slug: string) => `${shortBase}/q/${slug}`;

  const totalScans = qrAssets.reduce((sum, q) => sum + q.scans, 0);
  const totalOpens = qrAssets.reduce((sum, q) => sum + q.pageOpens, 0);
  const avgOpenRate = totalScans > 0 ? Math.round((totalOpens / totalScans) * 100) : 0;

  return (
    <>
      {/* Print: hide the app chrome so the kit sheet is the only printed output. */}
      <style>{`@media print { aside, header, nav { display: none !important; } main { padding: 0 !important; } }`}</style>

      <div className="space-y-5 print:hidden">
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
                    <div className="mt-3">
                      <QrDownload
                        svgContainerId={`qr-svg-${qr.id}`}
                        filename={`foundly-qr-${qr.slug}`}
                      />
                    </div>
                    <div className="mt-3 flex justify-center gap-2">
                      <Badge tone="primary" icon="qr">{formatNumber(qr.scans)} scans</Badge>
                      <Badge tone="neutral" icon="eye">{formatNumber(qr.pageOpens)} opens</Badge>
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

        {/* Degrade notice — trust signal (semantic callout, line icon) */}
        <div className="flex items-start gap-3 rounded-card border border-primary/25 bg-primary-wash/50 p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="shield" size={20} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-ink">Your codes never go dead</div>
            <p className="mt-0.5 text-[14px] text-sub">
              If your plan lapses, codes redirect to your public Google review page for 90 days.
              No reprinting, no lock-in.
            </p>
          </div>
        </div>

        {/* Scan analytics — StatTiles + per-asset open-rate meters */}
        <Card>
          <CardHeader title="Scan analytics" />
          {qrAssets.length ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Total scans" value={totalScans} />
                <StatTile label="Page opens" value={totalOpens} />
                <StatTile label="Avg open rate" value={`${avgOpenRate}%`} />
              </div>

              <div className="mt-5 space-y-4">
                <div className="kicker">Open rate by asset</div>
                {qrAssets.map((qr) => {
                  const rate = qr.scans > 0 ? Math.round((qr.pageOpens / qr.scans) * 100) : 0;
                  return (
                    <div key={qr.id}>
                      <ProgressMeter
                        value={rate}
                        max={100}
                        label={qr.label}
                        valueText={`${formatNumber(qr.pageOpens)} of ${formatNumber(qr.scans)} · ${rate}%`}
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
