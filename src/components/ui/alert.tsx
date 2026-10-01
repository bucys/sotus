import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-4 py-3 text-left motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      tone: {
        info: "border-border bg-muted text-foreground",
        problem:
          "border-border border-l-4 border-l-highlight bg-card text-foreground *:[svg]:text-highlight-ink",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  }
)

type Announce = "off" | "polite" | "assertive"

const roleFor = { off: undefined, polite: "status", assertive: "alert" } as const

function Alert({
  className,
  tone,
  announce = "off",
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & { announce?: Announce }) {
  return (
    <div
      data-slot="alert"
      role={roleFor[announce]}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "type-label group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "type-body text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
