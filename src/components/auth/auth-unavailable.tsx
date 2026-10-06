"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PageContainer } from "@/components/shell/page-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authMessages } from "@/lib/auth/messages";

export function AuthUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <PageContainer width="reading" className="flex flex-col gap-4 py-16">
      <Alert tone="problem" announce="assertive">
        <AlertTitle>{authMessages.unavailableTitle}</AlertTitle>
        <AlertDescription>{authMessages.unavailableBody}</AlertDescription>
      </Alert>
      <Button
        ref={retryRef}
        variant="secondary"
        className="self-start"
        pending={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        Try again
      </Button>
    </PageContainer>
  );
}
