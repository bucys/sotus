import type { ReactNode } from "react";
import Link from "next/link";

import { NavLinks } from "@/components/shell/nav-links";
import type { NavItem } from "@/components/shell/nav-items";
import { PageContainer } from "@/components/shell/page-container";

type AppHeaderProps = {
  items: readonly NavItem[];
  actions?: ReactNode;
};

export function AppHeader({ items, actions }: AppHeaderProps) {
  return (
    <header className="border-b bg-card">
      <PageContainer
        width="wide"
        className="flex min-h-16 items-center justify-between gap-4"
      >
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md type-title"
          >
            Sotus
          </Link>
          <div className="hidden md:block">
            <NavLinks items={items} placement="inline" />
          </div>
        </div>
        {actions}
      </PageContainer>
    </header>
  );
}
