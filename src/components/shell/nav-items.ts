export type NavIconName = "library" | "gallery" | "home";

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: NavIconName;
  readonly match: "exact" | "prefix";
};

// Only routes that exist belong here. #11 adds "My recipes" and #12 adds "Cook today" when their routes ship.
export const navItems: readonly NavItem[] = [
  { href: "/", label: "Library", icon: "library", match: "exact" },
];
