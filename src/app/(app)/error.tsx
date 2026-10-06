"use client";

import { useEffect, useRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shell/page-container";
import { authMessages } from "@/lib/auth/messages";

export default function AppError({ reset }: { reset: () => void }) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <PageContainer width="reading" className="flex flex-col gap-4 py-16">
      <Alert tone="problem" announce="assertive">
        <AlertTitle>{authMessages.appErrorTitle}</AlertTitle>
        <AlertDescription>{authMessages.appErrorBody}</AlertDescription>
      </Alert>
      <Button
        ref={retryRef}
        variant="secondary"
        className="self-start"
        onClick={reset}
      >
        Try again
      </Button>
    </PageContainer>
  );
}
