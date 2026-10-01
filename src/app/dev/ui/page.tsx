import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { GalleryDemos } from "@/app/dev/ui/gallery-demos";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav-items";
import { PageContainer } from "@/components/shell/page-container";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

const tokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "primary-hover",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "highlight",
  "highlight-foreground",
  "highlight-ink",
] as const;

const typeUtilities = [
  { name: "type-display", className: "type-display" },
  { name: "type-heading", className: "type-heading" },
  { name: "type-title", className: "type-title" },
  { name: "type-body-lg", className: "type-body-lg" },
  { name: "type-body", className: "type-body" },
  { name: "type-label", className: "type-label" },
  { name: "type-caption", className: "type-caption" },
] as const;

const galleryItem: NavItem = {
  href: "/dev/ui",
  label: "Gallery",
  icon: "gallery",
  match: "prefix",
};
const homeItem: NavItem = {
  href: "/",
  label: "Home",
  icon: "home",
  match: "exact",
};

const buttonVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-heading text-balance">{title}</h2>
      {children}
    </section>
  );
}

export default async function GalleryPage({
  searchParams,
}: PageProps<"/dev/ui">) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  // ?nav=one shows the shell with a single destination, where both navigations must render nothing.
  const { nav } = await searchParams;
  const items = nav === "one" ? [galleryItem] : [galleryItem, homeItem];

  return (
    <AppShell items={items}>
      <PageContainer width="reading" className="flex flex-col gap-12 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="type-display text-balance">UI gallery</h1>
          <p className="type-body text-pretty text-muted-foreground">
            Every token, type utility and component state. Development only.
          </p>
          <Link
            href={nav === "one" ? "/dev/ui" : "/dev/ui?nav=one"}
            className="inline-flex min-h-11 items-center type-label text-primary underline underline-offset-4"
          >
            {nav === "one" ? "Show two destinations" : "Show one destination"}
          </Link>
        </header>

        <Section title="Colour tokens">
          <ul className="grid grid-cols-2 gap-3">
            {tokens.map((token) => (
              <li key={token} className="flex flex-col gap-1">
                <div
                  className="h-12 rounded-md border"
                  style={{ background: `var(--${token})` }}
                />
                <span className="type-caption">{token}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Typography">
          <div className="flex flex-col gap-4">
            {typeUtilities.map(({ name, className }) => (
              <div key={name} className="flex flex-col">
                <span className="type-caption text-muted-foreground">
                  {name}
                </span>
                <p className={`${className} text-pretty`}>
                  Garlic butter noodles for two
                </p>
              </div>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Tabular figures</CardTitle>
              <CardDescription>
                Digits should line up in a column.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col items-end type-body tabular-nums">
                <li>1,111.11</li>
                <li>888.88</li>
                <li>0,000.00</li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-3">
            {buttonVariants.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled>Disabled</Button>
            <Button pending pendingLabel="Reading…">
              Add
            </Button>
            <Button size="icon" variant="outline" aria-label="Spinner example">
              <Spinner />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="destructive">destructive</Badge>
          </div>
        </Section>

        <GalleryDemos />

        <Section title="Static feedback">
          <Alert tone="info">
            <AlertTitle>Info, announce off</AlertTitle>
            <AlertDescription>
              Present on load, read in normal order.
            </AlertDescription>
          </Alert>
          <Alert tone="info" announce="polite">
            <AlertTitle>Info, announce polite</AlertTitle>
            <AlertDescription>Uses role status.</AlertDescription>
          </Alert>
          <Alert tone="problem">
            <InboxIcon aria-hidden="true" />
            <AlertTitle>Problem, announce off</AlertTitle>
            <AlertDescription>Paprika side bar, no red.</AlertDescription>
          </Alert>
          <Alert tone="problem" announce="polite">
            <InboxIcon aria-hidden="true" />
            <AlertTitle>Problem, announce polite</AlertTitle>
            <AlertDescription>Uses role status.</AlertDescription>
          </Alert>
        </Section>

        <Section title="Empty and loading">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No recipes yet</EmptyTitle>
              <EmptyDescription>
                Paste a link above to add your first one.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary">Add a link</Button>
            </EmptyContent>
          </Empty>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Section>
      </PageContainer>
    </AppShell>
  );
}
