"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon, HouseIcon, LayoutGridIcon } from "lucide-react";
import { cn } from "cn";

import type { NavIconName, NavItem } from "@/components/shell/nav-items";

// Icons are mapped here because a component function cannot cross from a Server Component into this client one.
const icons = {
  library: BookOpenIcon,
  gallery: LayoutGridIcon,
  home: HouseIcon,
} as const satisfies Record<NavIconName, typeof BookOpenIcon>;

const isActive = (item: NavItem, pathname: string) =>
  item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

type NavLinksProps = {
  items: readonly NavItem[];
  placement: "inline" | "bottom";
};

export function NavLinks({ items, placement }: NavLinksProps) {
  const pathname = usePathname();

  if (items.length < 2) {
    return null;
  }

  const isBottom = placement === "bottom";

  return (
    <nav aria-label="Main" className={isBottom ? "h-full" : undefined}>
      <ul className={cn("flex", isBottom ? "h-full" : "items-center gap-1")}>
        {items.map((item) => {
          const active = isActive(item, pathname);
          const Icon = icons[item.icon];

          return (
            <li key={item.href} className={isBottom ? "flex-1" : undefined}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-11 items-center rounded-md type-caption transition-colors duration-150 ease-out hover:bg-accent",
                  isBottom
                    ? "h-full flex-col justify-center gap-1 rounded-none px-2"
                    : "gap-2 px-3",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon
                  aria-hidden="true"
                  size={isBottom ? 22 : 20}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span className={active ? "font-semibold" : undefined}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
