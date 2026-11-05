import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** "Sync DB": re-calls the API and saves to IndexedDB whatever differs from the saved copy.
 *  `onSync` resolves to whether anything changed. */
export function SyncDbButton({ onSync, className }: { onSync: () => Promise<boolean>; className?: string }) {
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try {
      const changed = await onSync();
      if (changed) toast.success("Sync: new data found and saved");
      else toast("Sync: already up to date");
    } catch (e) {
      toast.error("Sync failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSyncing(false);
    }
  };
  return (
    <button
      type="button" onClick={sync} disabled={syncing}
      title="Call the API and save any differences to the local database"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-60",
        className,
      )}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
      {syncing ? "Syncing…" : "Sync"}
    </button>
  );
}
