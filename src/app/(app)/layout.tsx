import type { ReactNode } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { AuthUnavailable } from "@/components/auth/auth-unavailable";
import { AppShell } from "@/components/shell/app-shell";
import { loadProfile } from "@/lib/auth/profile";
import { requirePageUser } from "@/lib/auth/require-user";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // A layout cannot know the page path, so a signed out visit returns to "/".
  const user = await requirePageUser();
  if (user.status === "unavailable") {
    return (
      <AppShell>
        <AuthUnavailable />
      </AppShell>
    );
  }
  const profile = await loadProfile(user.userId);

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
