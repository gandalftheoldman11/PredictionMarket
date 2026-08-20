const MARKET_LIFECYCLE_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Live book",
  cancel_only: "Cancel only",
  halted: "Halted",
  closed: "Closed",
  disputed: "Disputed",
  resolving: "Resolving",
  resolved: "Resolved",
  settled: "Settled",
};

export function marketLifecycleLabel(status: string): string {
  return MARKET_LIFECYCLE_LABELS[status] ?? status.replaceAll("_", " ");
}

export function marketAcceptsNewOrders(status: string): boolean {
  return status === "open";
}

export function marketResolutionLabel(resolution: string | null): string | null {
  if (resolution === null || resolution.length === 0) return null;
  if (resolution === "yes") return "Yes";
  if (resolution === "no") return "No";
  return resolution
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
