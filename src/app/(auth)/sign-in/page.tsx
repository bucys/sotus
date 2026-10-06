import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInButton } from "@/components/auth/sign-in-button";
import { PageContainer } from "@/components/shell/page-container";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInWithGoogle } from "@/lib/auth/actions";
import {
  authMessages,
  errorMessages,
  toAuthErrorCode,
} from "@/lib/auth/messages";
import { requireUser } from "@/lib/auth/require-user";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type SignInPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  const user = await requireUser();
  if (user.status === "signed_in") redirect(next);

  const errorCode = params.error ? toAuthErrorCode(params.error) : undefined;

  return (
    <main id="main" className="flex flex-1 items-center">
      <PageContainer width="reading" className="flex flex-col gap-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="type-display">{authMessages.wordmark}</h1>
          <p className="type-body-lg text-pretty text-muted-foreground">
            {authMessages.purpose}
          </p>
        </div>
        {errorCode ? (
          <Alert tone="problem" announce="assertive">
            <AlertDescription>{errorMessages[errorCode]}</AlertDescription>
          </Alert>
        ) : null}
        <form action={signInWithGoogle} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <SignInButton />
        </form>
        <p className="type-caption text-muted-foreground">
          {authMessages.inAppBrowserHint}
        </p>
      </PageContainer>
    </main>
  );
}
