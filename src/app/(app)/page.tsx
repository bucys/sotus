import { AddLinkForm } from "@/components/recipes/add-link-form";
import { PageContainer } from "@/components/shell/page-container";

// The add form's Server Action runs under this route, and an extraction can take 75 s.
export const maxDuration = 90;

export default function HomePage() {
  return (
    <PageContainer
      width="reading"
      className="flex flex-col gap-6 py-10 md:py-16"
    >
      <div className="flex flex-col gap-3">
        <h1 className="type-display text-balance">Sotus</h1>
        <p className="type-body-lg text-pretty text-muted-foreground">
          Turn a cooking video or recipe link into a clean, reusable recipe.
        </p>
      </div>
      <AddLinkForm />
    </PageContainer>
  );
}
