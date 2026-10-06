"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import { getInitials } from "@/lib/auth/initials";
import { authMessages } from "@/lib/auth/messages";

type AccountMenuProps = {
  displayName: string;
  avatarUrl: string | undefined;
};

export function AccountMenu({ displayName, avatarUrl }: AccountMenuProps) {
  const [state, signOutAction] = useActionState(signOut, undefined);

  return (
    <>
      {/* Outside the menu content: closing the menu on select must not unmount the form before it submits. */}
      <form id="sign-out-form" action={signOutAction} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full p-0"
            aria-label={`Account menu, ${displayName}`}
          >
            <Avatar>
              {avatarUrl ? (
                <AvatarImage
                  src={avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <button type="submit" form="sign-out-form" className="w-full">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state?.ok === false ? (
        <Alert
          tone="problem"
          announce="assertive"
          className="fixed inset-x-4 top-20 z-50 w-auto md:right-6 md:left-auto md:max-w-sm"
        >
          <AlertDescription>
            {authMessages.signOutFailed}
            <button
              type="submit"
              form="sign-out-form"
              className="mt-2 block min-h-11 underline underline-offset-4"
            >
              Try again
            </button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
