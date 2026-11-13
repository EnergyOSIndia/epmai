import { Link, useLocation } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { MODS, isMod, modName, type ModId } from "@/data/engine";
import {
  NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink,
  NavigationMenuList, NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

/** Header "Modules" entry rendered as a shadcn Navigation Menu: a trigger that opens a
 *  panel of every module. Picking a module lands on that module's Overview — its complete
 *  "every horizon" view — by default. Independent of the "Planning horizon" menu. While a
 *  module's pages are open the trigger shows that module's name instead of "Modules". */
export function ModuleNav() {
  const { pathname } = useLocation();
  const seg = pathname.startsWith("/modules/") ? pathname.split("/")[2] : undefined;
  const activeMod = isMod(seg) ? seg : undefined;

  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger
            className={cn("h-auto gap-1 bg-transparent px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground",
              activeMod && "bg-accent text-foreground")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="max-w-[10rem] truncate">{activeMod ? modName(activeMod) : "Modules"}</span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="w-[min(90vw,34rem)] p-3">
              <ul className="grid gap-1 sm:grid-cols-2">
                {MODS.map((m) => (
                  <ModuleItem key={m.id} moduleId={m.id}
                    active={activeMod === m.id}
                    title={modName(m.id)} desc={m.sub} />
                ))}
              </ul>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function ModuleItem({ moduleId, active, title, desc }: {
  moduleId: ModId; active: boolean; title: string; desc: string;
}) {
  return (
    <NavigationMenuLink asChild>
      <Link
        to="/modules/$moduleId/row"
        params={{ moduleId }}
        className={cn("block select-none rounded-md border p-3 leading-none no-underline outline-none transition-colors hover:bg-accent focus:bg-accent",
          active ? "border-primary bg-accent" : "border-transparent")}
      >
        <div className="text-[13px] font-semibold leading-tight">{title}</div>
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{desc}</p>
      </Link>
    </NavigationMenuLink>
  );
}
