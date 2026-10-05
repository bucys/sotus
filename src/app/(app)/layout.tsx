import type { ReactNode } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { AppShell } from "@/components/shell/app-shell";
import { loadProfile } from "@/lib/auth/profile";
import { requirePageUser } from "@/lib/auth/require-user";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // A layout cannot know the page path, so a signed out visit returns to "/".
  const userId = await requirePageUser();
  const profile = await loadProfile(userId);

  return (
    <AppShell
      actions={
        <AccountMenu
          displayName={profile.displayName}
          avatarUrl={profile.avatarUrl}
        />
      }
    >
      {children}
    </AppShell>
  );
}
