import type { ReactNode } from "react";
import { cn } from "cn";

const widths = {
  reading: "max-w-2xl",
  wide: "max-w-5xl",
} as const;

type PageContainerProps = {
  width: keyof typeof widths;
  className?: string;
  children: ReactNode;
};

export function PageContainer({
  width,
  className,
  children,
}: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 md:px-6", widths[width], className)}
    >
      {children}
    </div>
  );
}
