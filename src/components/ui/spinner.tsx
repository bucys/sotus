import { cn } from "cn"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden="true"
      size={20}
      strokeWidth={1.75}
      className={cn("motion-safe:animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
