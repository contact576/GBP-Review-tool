import { Button, LinkButton } from "@/components/ds/Button";
import { Icon } from "@/components/icons";

/**
 * Honest client actions: report sending waits on the email service, so the
 * send button is disabled with a clear note. Previewing the report is real.
 */
export function ClientActions({ brandName }: { brandName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <LinkButton href="/app/report" variant="primary" icon="file" className="sm:flex-1">
          Preview report
        </LinkButton>
        <span
          className="sm:flex-1"
          title="Sends when the email service is connected"
        >
          <Button variant="secondary" icon="send" disabled fullWidth>
            Send branded report
          </Button>
        </span>
      </div>
      <p className="flex items-start gap-1.5 text-[12px] text-faint">
        <Icon name="clock" size={13} className="mt-px shrink-0" />
        Sending the {brandName}-branded report by email activates when the email service is
        connected.
      </p>
    </div>
  );
}
