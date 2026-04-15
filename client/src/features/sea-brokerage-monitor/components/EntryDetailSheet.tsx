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
import { getPaymentTermDisplayLabel, getTransportDisplayLabel } from "../services/displayStandards";
import {
  formatEntryDateTime,
  formatEntryCommodityCompact,
  formatEntryDestination,
  formatEntryDestinationCompact,
  formatEntryOriginCompact,
  formatEntryPeriodCompact,
  formatEntryPriceRange,
  formatEntryVolumeRange,
} from "../services/entryFormatting.service";

function extractHarvestYear(entry: BrokerageEntry) {
  const grade = String(entry.gradeOrSpec || "").trim();
  if (!grade) return null;
  const match = grade.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-foreground/70 dark:text-muted-foreground">{label}</div>
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function formatBrokerTelegramIdentity(telegramUsername?: string | null, telegramUserId?: string | null) {
  const username = String(telegramUsername || "").trim().replace(/^@+/, "");
  if (username) return `@${username.toLowerCase()}`;
  const userId = String(telegramUserId || "").trim();
  if (userId) return `tg:${userId}`;
  return "Not set";
}

function formatTransportDisplay(value: string | null | undefined) {
  return getTransportDisplayLabel(value) || "Not set";
}

function formatEntryStatusDisplay(status: BrokerageEntry["entryStatus"]) {
  const normalized = String(status || "active").trim().toLowerCase();
  if (normalized === "not_valid") return "Not valid";
  if (normalized === "needs_update") return "Needs update";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "executed") return "Executed";
  return "Active";
}

interface EntryDetailSheetProps {
  entry: BrokerageEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canRepost?: boolean;
  isDeleting?: boolean;
  isReposting?: boolean;
  onEdit?: (entry: BrokerageEntry) => void;
  onDelete?: (entry: BrokerageEntry) => void;
  onRepost?: (entry: BrokerageEntry) => void;
}

export function EntryDetailSheet({
  entry,
  open,
  onOpenChange,
  canEdit = false,
  canDelete = false,
  canRepost = false,
  isDeleting = false,
  isReposting = false,
  onEdit,
  onDelete,
  onRepost,
}: EntryDetailSheetProps) {
  const harvestYear = entry ? extractHarvestYear(entry) : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[100vw] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        {entry ? (
          <div className="space-y-6">
            <SheetHeader className="gap-3">
              <SheetTitle className="pr-8">Feed Entry Detail</SheetTitle>
              <SheetDescription>
                Structured sea brokerage entry detail with normalized canonical output.
              </SheetDescription>
              {canEdit || canDelete || canRepost ? (
                <div className="flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button size="sm" variant="outline" onClick={() => onEdit?.(entry)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete?.(entry)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  ) : null}
                  {canRepost ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRepost?.(entry)}
                      disabled={isReposting}
                    >
                      {isReposting ? "Reposting..." : "Repost"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </SheetHeader>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{entry.type.toUpperCase()}</Badge>
                <Badge variant="outline">{entry.commodityLabel}</Badge>
                <Badge variant="outline">{entry.basis}</Badge>
                <Badge variant="outline">{formatTransportDisplay(entry.transportType)}</Badge>
                <Badge variant="outline">Status: {formatEntryStatusDisplay(entry.entryStatus)}</Badge>
                {entry.telegramRelayStatus ? <Badge variant="outline">Telegram: {entry.telegramRelayStatus}</Badge> : null}
              </div>
              <div className="rounded-xl bg-background px-4 py-4 text-sm font-medium leading-6 shadow-sm">
                {entry.canonicalView}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Commodity"
                value={`${entry.commodityLabel} (${formatEntryCommodityCompact(entry)})`}
              />
              {(entry.type === "bid" || entry.type === "offer") ? (
                <DetailRow label="Crop cycle" value={entry.isNewCrop ? "NEW CROP" : "Current crop"} />
              ) : null}
              <DetailRow label="Seller" value={entry.sellerName ?? "Not set"} />
              <DetailRow label="Buyer" value={entry.buyerName ?? "Not set"} />
              {entry.type === "trade" ? (
                <DetailRow
                  label="Seller broker (Telegram)"
                  value={formatBrokerTelegramIdentity(
                    entry.tradeSellerBrokerTelegramUsername,
                    entry.tradeSellerBrokerTelegramUserId,
                  )}
                />
              ) : null}
              {entry.type === "trade" ? (
                <DetailRow
                  label="Buyer broker (Telegram)"
                  value={formatBrokerTelegramIdentity(
                    entry.tradeBuyerBrokerTelegramUsername,
                    entry.tradeBuyerBrokerTelegramUserId,
                  )}
                />
              ) : null}
              <DetailRow
                label="Origin"
                value={
                  entry.originCountry
                    ? `${entry.originCountry} (${formatEntryOriginCompact(entry)})`
                    : "Not set"
                }
              />
              <DetailRow label="Harvest year" value={harvestYear ?? "Not set"} />
              <DetailRow label="Quantity" value={formatEntryVolumeRange(entry)} />
              <DetailRow
                label="Tolerance"
                value={
                  entry.tolerancePct !== null && entry.tolerancePct !== undefined
                    ? `+/- ${entry.tolerancePct}%`
                    : "Not set"
                }
              />
              <DetailRow label="Delivery Basis" value={entry.basis} />
              <DetailRow label="Status" value={formatEntryStatusDisplay(entry.entryStatus)} />
              <DetailRow
                label="Payment Terms"
                value={
                  entry.paymentTerms
                    ? `${getPaymentTermDisplayLabel(entry.paymentTerms)} (${entry.paymentTerms})`
                    : "Not set"
                }
              />
              {entry.type === "trade" ? (
                <DetailRow
                  label="Seller commission"
                  value={
                    entry.sellerCommission !== null && entry.sellerCommission !== undefined
                      ? `${entry.sellerCommission} ${entry.currency}`
                      : "Not set"
                  }
                />
              ) : null}
              {entry.type === "trade" ? (
                <DetailRow
                  label="Buyer commission"
                  value={
                    entry.buyerCommission !== null && entry.buyerCommission !== undefined
                      ? `${entry.buyerCommission} ${entry.currency}`
                      : "Not set"
                  }
                />
              ) : null}
              <DetailRow
                label="Port / Place"
                value={`${formatEntryDestination(entry)} (${formatEntryDestinationCompact(entry)})`}
              />
              <DetailRow label="Operational Location" value={formatEntryDestinationCompact(entry)} />
              <DetailRow label="Shipment / Delivery" value={formatEntryPeriodCompact(entry)} />
              <DetailRow label="Period Start" value={entry.periodStart ?? "Not set"} />
              <DetailRow label="Period End" value={entry.periodEnd ?? "Not set"} />
              <DetailRow label="Price" value={`${formatEntryPriceRange(entry)} ${entry.currency}`} />
              <DetailRow label="Transport" value={formatTransportDisplay(entry.transportType)} />
              <DetailRow label="Other terms" value={entry.note || "Not set"} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <UserRound className="h-4 w-4 text-foreground/70 dark:text-muted-foreground" />
                  Author
                </div>
                <div className="space-y-2 text-sm">
                  <div>{entry.createdBy.displayName}</div>
                  <div className="text-foreground/70 dark:text-muted-foreground">{entry.createdBy.email}</div>
                  <div className="text-foreground/70 dark:text-muted-foreground">
                    {entry.createdBy.brokerCode} / {entry.createdBy.companyName}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4 text-foreground/70 dark:text-muted-foreground" />
                  Created
                </div>
                <div className="space-y-2 text-sm">
                  <div>{formatEntryDateTime(entry.createdAt)}</div>
                  <div className="text-foreground/70 dark:text-muted-foreground">{entry.createdAt}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShipWheel className="h-4 w-4 text-foreground/70 dark:text-muted-foreground" />
                Structured Routing
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Broker" value={`${entry.brokerCode} (${entry.brokerName})`} />
                <DetailRow label="Company" value={entry.companyName} />
                <DetailRow label="Seller" value={entry.sellerName ?? "Not set"} />
                <DetailRow label="Buyer" value={entry.buyerName ?? "Not set"} />
                <DetailRow
                  label="Origin"
                  value={
                    entry.originCountry
                      ? `${entry.originCountry} (${formatEntryOriginCompact(entry)})`
                      : "Not set"
                  }
                />
                <DetailRow label="Broker ID" value={entry.brokerId} />
                <DetailRow label="Entry ID" value={entry.id} />
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-foreground/70 dark:text-muted-foreground" />
                Other Terms
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
