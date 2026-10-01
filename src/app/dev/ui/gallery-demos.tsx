"use client";

import { InboxIcon } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const PROGRESS_MESSAGE = "Reading the page. This can take about a minute.";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function GalleryDemos() {
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [assertiveMounted, setAssertiveMounted] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setFailed(false);
    setFieldError(undefined);

    if (!value.startsWith("http")) {
      setFieldError("Enter a link that starts with http or https.");
      inputRef.current?.focus();
      return;
    }

    setPending(true);
    setStatus(PROGRESS_MESSAGE);
    await wait(3000);
    setStatus("");
    setPending(false);
    setFailed(true);
    inputRef.current?.focus();
  };

  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-heading text-balance">Form states</h2>
      <p className="type-body text-pretty text-muted-foreground">
        Type anything but a link and submit for a field error. Type a link and
        submit for the pending state, then the problem alert.
      </p>
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 rounded-lg border bg-card p-4"
      >
        <Field data-invalid={fieldError ? true : undefined}>
          <FieldLabel htmlFor={inputId}>Recipe link</FieldLabel>
          <Input
            id={inputId}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={
              fieldError ? `${descriptionId} ${errorId}` : descriptionId
            }
          />
          <FieldDescription id={descriptionId}>
            A video or recipe page link.
          </FieldDescription>
          {fieldError ? (
            <FieldError id={errorId}>{fieldError}</FieldError>
          ) : null}
        </Field>
        <Button type="submit" pending={pending} pendingLabel="Reading…">
          Add recipe
        </Button>
        <div role="status" className="type-caption text-muted-foreground">
          {status}
        </div>
        {failed ? (
          <Alert tone="problem" announce="assertive">
            <InboxIcon aria-hidden="true" />
            <AlertTitle>We could not read that link</AlertTitle>
            <AlertDescription>Check the link and try again.</AlertDescription>
          </Alert>
        ) : null}
      </form>

      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          onClick={() => setAssertiveMounted((current) => !current)}
        >
          {assertiveMounted ? "Remove" : "Mount"} the assertive alerts
        </Button>
        {assertiveMounted ? (
          <>
            <Alert tone="info" announce="assertive">
              <AlertTitle>Info, announce assertive</AlertTitle>
              <AlertDescription>
                Uses role alert, read once when mounted.
              </AlertDescription>
            </Alert>
            <Alert tone="problem" announce="assertive">
              <InboxIcon aria-hidden="true" />
              <AlertTitle>Problem, announce assertive</AlertTitle>
              <AlertDescription>
                Uses role alert, read once when mounted.
              </AlertDescription>
            </Alert>
          </>
        ) : null}
      </div>
    </section>
  );
}
