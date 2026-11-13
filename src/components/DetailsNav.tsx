import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ListTree } from "lucide-react";
import { MODS, TFS, isMod, modName, type ModId, type TfId } from "@/data/engine";
import {
  NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink,
  NavigationMenuList, NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { useModuleTf } from "@/lib/horizon";
import { cn } from "@/lib/utils";

/** The cell page's module, when one is open (/cell/<module>). */
function useCellMod(): ModId | undefined {
  const { pathname } = useLocation();
  const seg = pathname.split("/");
  return seg[1] === "cell" && isMod(seg[2]) ? seg[2] : undefined;
}

/** Header "Details" menu, in two steps: the 7 horizons (like "Planning horizon"); clicking one shows
 *  the 8 modules (with "Back"); clicking a module opens it at that horizon. Reopened on a Details
 *  page, it starts at the modules of the open horizon. The cell pages (a module
 *  at one horizon — what a Command centre cell opens) live under it. On a cell page the open horizon
 *  and module are highlighted; the open view tab is kept when the module stays the same. */
export function DetailsNav() {
  const navigate = useNavigate();
  const cellMod = useCellMod();
  const { tf } = useModuleTf();
  // Step 2 once a horizon is picked. Opening the menu on a Details page goes straight to the
  // modules of the open horizon (Back shows the horizons); elsewhere it starts at the horizons.
  const [step, setStep] = useState<TfId | null>(null);
  const open = (m: ModId) => {
    if (!step) return;
    navigate({
      to: "/cell/$moduleId", params: { moduleId: m },
      search: (prev: Record<string, unknown>) => ({ m: step, ...(m === cellMod && typeof prev.t === "string" ? { t: prev.t } : {}) }),
    });
  };
  const stepName = TFS.find((t) => t.id === step)?.name;
  const item = "block w-full select-none rounded-md border p-3 text-left leading-none outline-none transition-colors hover:bg-accent focus:bg-accent";
  const label = "px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <NavigationMenu onValueChange={(v) => setStep(v && cellMod ? tf : null)}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger
            className={cn("h-auto gap-1 bg-transparent px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground",
              cellMod && "bg-accent text-foreground")}
          >
            <ListTree className="h-3.5 w-3.5" />
            Details
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="w-[min(90vw,34rem)] p-3">
              {!step ? (
                <>
                  <p className={label}>Horizon</p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {TFS.map((t) => (
                      <li key={t.id}>
                        {/* A plain button (not a menu link): picking a horizon keeps the menu open for step 2. */}
                        <button type="button" onClick={() => setStep(t.id)}
                          className={cn(item, cellMod && t.id === tf ? "border-primary bg-accent" : "border-transparent")}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold leading-tight">{t.name}</span>
                            <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{t.span}</span>
                          </div>
                          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{t.hz}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                    <button type="button" onClick={() => setStep(null)}
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                      <ArrowLeft className="h-3.5 w-3.5" /> Back
                    </button>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stepName} · Module</span>
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {MODS.map((m) => (
                      <li key={m.id}>
                        <NavigationMenuLink asChild>
                          <button type="button" onClick={() => open(m.id)}
                            className={cn(item, cellMod === m.id && step === tf ? "border-primary bg-accent" : "border-transparent")}>
                            <span className="block text-[13px] font-semibold leading-tight">{modName(m.id)}</span>
                            <span className="mt-1.5 block truncate text-[12px] leading-snug text-muted-foreground">{m.sub}</span>
                          </button>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
