import { CalendarClock, FileText, ShipWheel, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BrokerageEntry } from "../types";
import { formatEntryDateTime, formatEntryPriceRange, formatEntryVolumeRange } from "../services/entryFormatting.service";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

interface EntryDetailSheetProps {
  entry: BrokerageEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EntryDetailSheet({ entry, open, onOpenChange }: EntryDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {entry ? (
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle className="pr-8">Feed Entry Detail</SheetTitle>
              <SheetDescription>
                Structured sea brokerage entry detail with normalized canonical output.
              </SheetDescription>
            </SheetHeader>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{entry.type.toUpperCase()}</Badge>
                <Badge variant="outline">{entry.commodityLabel}</Badge>
                <Badge variant="outline">{entry.basis}</Badge>
                <Badge variant="outline">{entry.transportType}</Badge>
                {entry.telegramRelayStatus ? <Badge variant="outline">Telegram: {entry.telegramRelayStatus}</Badge> : null}
              </div>
              <div className="rounded-xl bg-background px-4 py-4 text-sm font-medium leading-6 shadow-sm">
                {entry.canonicalView}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Commodity" value={entry.commodityLabel} />
              <DetailRow label="Seller" value={entry.sellerName ?? "Not set"} />
              <DetailRow label="Buyer" value={entry.buyerName ?? "Not set"} />
              <DetailRow label="Grade / Spec" value={entry.gradeOrSpec} />
              <DetailRow label="Volume" value={formatEntryVolumeRange(entry)} />
              <DetailRow label="Basis" value={entry.basis} />
              <DetailRow label="Destination Port" value={entry.destinationPort} />
              <DetailRow label="Destination Country" value={entry.destinationCountry} />
              <DetailRow label="Period Type" value={entry.periodType} />
              <DetailRow label="Period Label" value={entry.periodLabel} />
              <DetailRow label="Period Start" value={entry.periodStart ?? "Not set"} />
              <DetailRow label="Period End" value={entry.periodEnd ?? "Not set"} />
              <DetailRow label="Price Range" value={`${formatEntryPriceRange(entry)} ${entry.currency}`} />
              <DetailRow label="Transport Type" value={entry.transportType} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  Author
                </div>
                <div className="space-y-2 text-sm">
                  <div>{entry.createdBy.displayName}</div>
                  <div className="text-muted-foreground">{entry.createdBy.email}</div>
                  <div className="text-muted-foreground">
                    {entry.createdBy.brokerCode} / {entry.createdBy.companyName}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  Created
                </div>
                <div className="space-y-2 text-sm">
                  <div>{formatEntryDateTime(entry.createdAt)}</div>
                  <div className="text-muted-foreground">{entry.createdAt}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShipWheel className="h-4 w-4 text-muted-foreground" />
                Structured Routing
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Broker" value={`${entry.brokerCode} (${entry.brokerName})`} />
                <DetailRow label="Company" value={entry.companyName} />
                <DetailRow label="Seller" value={entry.sellerName ?? "Not set"} />
                <DetailRow label="Buyer" value={entry.buyerName ?? "Not set"} />
                <DetailRow label="Broker ID" value={entry.brokerId} />
                <DetailRow label="Entry ID" value={entry.id} />
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Note
              </div>
              <div className="rounded-xl bg-background px-4 py-4 text-sm text-foreground shadow-sm">
                {entry.note || "No note provided."}
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
