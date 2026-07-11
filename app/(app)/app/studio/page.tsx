import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { QrFrame } from "@/components/app/QrFrame";
import { formatNumber } from "@/lib/utils/format";
import { EmbedSnippet } from "./EmbedSnippet";

const PRINT_KITS = [
  { label: "Counter card", hint: "A5 stand for the front desk", icon: "building" as const },
  { label: "Table tent", hint: "Folded card for treatment rooms", icon: "file" as const },
  { label: "Window cling", hint: "Static cling for the door", icon: "map-pin" as const },
];

export default async function StudioPage() {
  const data = await getData();
  const qrAssets = data.qrAssets ?? [];
  const locationQr = qrAssets.find((a) => a.scope === "location");
  const staffQrs = qrAssets.filter((a) => a.scope === "staff");
  const widget = (data.widgets ?? [])[0];
  const staffById = new Map(data.staff.map((s) => [s.id, s]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">QR &amp; Widgets</h1>
        <p className="text-[14px] text-sub">
          The tools that turn a happy visit into a review — printed, worn, and embedded.
        </p>
      </div>

      {/* Location QR hero */}
      <Card raised>
        <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-2">
          <div>
            <div className="kicker mb-1">Your clinic QR</div>
            <h2 className="text-[18px] font-bold text-ink">One code, every counter</h2>
            <p className="mt-1 text-[13px] text-sub">
              Print it, stick it at reception, and let customers scan straight into your review flow.
            </p>
            {locationQr ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="primary" icon="qr">{formatNumber(locationQr.scans)} scans</Badge>
                <Badge tone="neutral" icon="eye">{formatNumber(locationQr.pageOpens)} page opens</Badge>
              </div>
            ) : null}
          </div>
          {locationQr ? (
            <QrFrame
              url={locationQr.targetUrl}
              title={locationQr.label}
              subtitle="Scan to leave us a quick review"
            />
          ) : (
            <p className="text-center text-[13px] text-faint">No location QR configured.</p>
          )}
        </div>
      </Card>

      {/* Per-staff QR cards */}
      <Card>
        <CardHeader kicker="Team" title="Staff QR codes" />
        {staffQrs.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staffQrs.map((qr) => {
              const staff = qr.staffId ? staffById.get(qr.staffId) : undefined;
              return (
                <div key={qr.id} className="rounded-card border border-hairline p-4">
                  <QrFrame url={qr.targetUrl} title={staff?.displayName ?? qr.label} subtitle={qr.label} />
                  <div className="mt-3 flex justify-center gap-2">
                    <Badge tone="primary" icon="qr">{formatNumber(qr.scans)} scans</Badge>
                    <Badge tone="neutral" icon="eye">{formatNumber(qr.pageOpens)} opens</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-faint">No staff QR codes yet.</p>
        )}
      </Card>

      {/* Print kit */}
      <Card>
        <CardHeader kicker="Print kit" title="Ready-to-print templates" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PRINT_KITS.map((kit) => (
            <div key={kit.label} className="rounded-card border border-hairline bg-primary-wash/40 p-4">
              <div className="mx-auto grid aspect-[3/4] w-24 place-items-center rounded-btn border border-dashed border-primary/40 bg-card">
                <div className="text-center">
                  <div className="mx-auto mb-1 grid size-8 place-items-center rounded bg-ink text-white">
                    <Icon name="qr" size={16} />
                  </div>
                  <div className="text-[8px] font-bold text-ink">SCAN TO REVIEW</div>
                </div>
              </div>
              <div className="mt-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Icon name={kit.icon} size={14} className="text-primary" />
                  {kit.label}
                </div>
                <p className="mt-0.5 text-[11px] text-faint">{kit.hint}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-faint">Templates open as print-ready PDFs with your clinic QR baked in.</p>
      </Card>

      {/* Website widget */}
      <Card>
        <CardHeader
          kicker="Website"
          title="Review widget embed"
          action={
            widget ? (
              <span className="text-[12px] text-sub">
                {formatNumber(widget.impressions)} views · {formatNumber(widget.clicks)} clicks
              </span>
            ) : undefined
          }
        />
        <EmbedSnippet slug={locationQr?.slug ?? "harbourview"} domain={widget?.domain ?? "your-site.com"} />
      </Card>

      {/* Degrade notice — trust signal */}
      <Card className="border-primary/30 bg-primary-wash/50">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="shield" size={20} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">Your codes never go dead</div>
            <p className="mt-0.5 text-[13px] text-sub">
              If your subscription lapses, printed QR codes keep working — they redirect straight to your
              plain Google review link for 90 days. No reprinting, no lock-in.
            </p>
          </div>
        </div>
      </Card>

      {/* Scan analytics */}
      <Card>
        <CardHeader kicker="Performance" title="Scan analytics" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-faint">
                <th className="py-2 pr-4 font-medium">Asset</th>
                <th className="py-2 pr-4 font-medium">Scans</th>
                <th className="py-2 pr-4 font-medium">Page opens</th>
                <th className="py-2 font-medium">Open rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {qrAssets.map((qr) => (
                <tr key={qr.id}>
                  <td className="py-2.5 pr-4 font-semibold text-ink">{qr.label}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-sub">{formatNumber(qr.scans)}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-sub">{formatNumber(qr.pageOpens)}</td>
                  <td className="py-2.5 tabular-nums text-sub">
                    {qr.scans > 0 ? Math.round((qr.pageOpens / qr.scans) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
