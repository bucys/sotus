import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav-items";

export const metadata: Metadata = {
  title: "UI gallery",
  robots: { index: false },
};

const demoItems: readonly NavItem[] = [
  { href: "/dev/ui", label: "Gallery", icon: "gallery", match: "prefix" },
  { href: "/", label: "Home", icon: "home", match: "exact" },
];

export default function GalleryLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <AppShell items={demoItems}>{children}</AppShell>;
}
