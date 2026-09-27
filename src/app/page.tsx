export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Sotus</h1>
      <p className="text-muted-foreground text-balance">
        Turn a cooking video or recipe link into a clean, reusable recipe.
      </p>
      <p className="text-muted-foreground text-sm">
        Scaffold only. Sign in, the recipe library and link extraction come next.
      </p>
    </main>
  );
}
