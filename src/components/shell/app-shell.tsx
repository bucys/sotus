import type { ReactNode } from "react";
import { cn } from "cn";

import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { navItems, type NavItem } from "@/components/shell/nav-items";
import { SkipLink } from "@/components/shell/skip-link";

type AppShellProps = {
  actions?: ReactNode;
  // Only the /dev/ui gallery passes this, to demo the navigation with two destinations.
  items?: readonly NavItem[];
  children: ReactNode;
};

export function AppShell({
  actions,
  items = navItems,
  children,
}: AppShellProps) {
  const hasBottomNav = items.length >= 2;

  return (
    <>
      <SkipLink />
      <AppHeader items={items} actions={actions} />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "flex-1 outline-none",
          hasBottomNav && "max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </main>
      <BottomNav items={items} />
    </>
  );
}
