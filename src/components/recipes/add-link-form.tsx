"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addRecipeFromLink } from "@/lib/extraction/add-recipe-from-link";
import { IDLE_ADD_LINK_STATE } from "@/lib/extraction/add-link-state";
import { isYouTubeHost } from "@/lib/extraction/hosts";

const PROGRESS = {
  web: "Reading the page… this can take up to a minute",
  youtube: "Reading the video… this can take about a minute",
} as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} pendingLabel="Reading…">
      Add recipe
    </Button>
  );
}

export function AddLinkForm() {
  const inputId = useId();
  const descriptionId = useId();
  const errorId = "add-link-error";
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, isPending] = useActionState(
    addRecipeFromLink,
    IDLE_ADD_LINK_STATE,
  );
  const [source, setSource] = useState<keyof typeof PROGRESS>("web");
  const [announcement, setAnnouncement] = useState("");

  // React resets an uncontrolled form after its action, so the input is remounted with
  // each new result and its default value restores the link that was submitted.
  const [seenState, setSeenState] = useState(state);
  const [resultCount, setResultCount] = useState(0);
  if (seenState !== state) {
    setSeenState(state);
    setResultCount(resultCount + 1);
  }

  useEffect(() => {
    if (state.status !== "failed") return;
    const input = inputRef.current;
    if (!input) return;
    // Focusing an already focused input fires no event, so its error would not be read;
    // the status region speaks instead (0004 feedback contract).
    if (state.target === "field" && document.activeElement === input) {
      const frame = requestAnimationFrame(() => setAnnouncement(state.message));
      return () => cancelAnimationFrame(frame);
    }
    input.focus();
  }, [state]);

  const failed = state.status === "failed" ? state : undefined;
  const fieldError = failed?.target === "field" ? failed.message : undefined;

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const value = new FormData(event.currentTarget).get("url");
        setSource(
          typeof value === "string" && isYouTubeHost(value.trim())
            ? "youtube"
            : "web",
        );
        setAnnouncement("");
      }}
      noValidate
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor={inputId}>Recipe link</FieldLabel>
        <Input
          key={resultCount}
          id={inputId}
          ref={inputRef}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={failed?.url ?? ""}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={
            fieldError ? `${descriptionId} ${errorId}` : descriptionId
          }
        />
        <FieldDescription id={descriptionId}>
          A recipe page or a YouTube video.
        </FieldDescription>
        {fieldError ? <FieldError id={errorId}>{fieldError}</FieldError> : null}
      </Field>
      <SubmitButton />
      <div
        id="add-link-status"
        role="status"
        className="type-caption text-muted-foreground"
      >
        {isPending ? PROGRESS[source] : null}
        {announcement ? <span className="sr-only">{announcement}</span> : null}
      </div>
      {failed?.target === "alert" ? (
        <Alert tone="problem" announce="assertive">
          <AlertDescription>
            {failed.message}
            {failed.signInHref ? (
              <>
                {" "}
                <Link href={failed.signInHref}>Sign in</Link>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
