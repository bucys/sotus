import { PageContainer } from "@/components/shell/page-container";

export default function HomePage() {
  return (
    <main id="main" className="flex-1">
      <PageContainer width="reading" className="flex flex-col gap-3 py-16">
        <h1 className="type-display text-balance">Sotus</h1>
        <p className="type-body-lg text-pretty text-muted-foreground">
          Turn a cooking video or recipe link into a clean, reusable recipe.
        </p>
        <p className="type-caption text-muted-foreground">
          Scaffold only. Sign in, the recipe library and link extraction come
          next.
        </p>
      </PageContainer>
    </main>
  );
}
