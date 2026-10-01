import { NavLinks } from "@/components/shell/nav-links";
import type { NavItem } from "@/components/shell/nav-items";

export function BottomNav({ items }: { items: readonly NavItem[] }) {
  if (items.length < 2) {
    return null;
  }

  return (
    <div
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 h-[calc(4rem+env(safe-area-inset-bottom))] border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <NavLinks items={items} placement="bottom" />
    </div>
  );
}
