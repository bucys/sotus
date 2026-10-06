import type { ActionReason } from "@/lib/ai/attempt-reasons";

/** The add form's `useActionState` state. Success never returns one; it redirects. */
export type AddLinkState =
  | { readonly status: "idle" }
  | {
      readonly status: "failed";
      /** What the user submitted, restored into the field. */
      readonly url: string;
      readonly reason: ActionReason;
      readonly message: string;
      readonly target: "field" | "alert";
      readonly signInHref?: string;
    };

export const IDLE_ADD_LINK_STATE: AddLinkState = { status: "idle" };
