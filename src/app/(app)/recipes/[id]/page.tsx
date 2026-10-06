import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";

import { AuthUnavailable } from "@/components/auth/auth-unavailable";
import { PageContainer } from "@/components/shell/page-container";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ALREADY_IN_LIBRARY_NOTICE } from "@/lib/extraction/messages";
import {
  ingredientAmount,
  loadRecipe,
  sourceHost,
} from "@/lib/recipes/load-recipe";

type RecipePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
};

const ROBOTS = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: RecipePageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await loadRecipe(id);
  return {
    title:
      result.status === "found"
        ? `${result.recipe.title} · Sotus`
        : "Recipe · Sotus",
    robots: ROBOTS,
  };
}

export default async function RecipePage({
  params,
  searchParams,
}: RecipePageProps) {
  const { id } = await params;
  const result = await loadRecipe(id);
  if (result.status === "unavailable") return <AuthUnavailable />;
  if (result.status === "not_found") notFound();

  const { recipe } = result;
  const { notice } = await searchParams;

  return (
    <PageContainer
      width="reading"
      className="flex flex-col gap-6 py-6 md:py-10"
    >
      <Button variant="ghost" asChild className="-ml-3 self-start">
        <Link href="/">
          <ArrowLeftIcon aria-hidden="true" />
          Back to home
        </Link>
      </Button>

      <header className="flex flex-col gap-2">
        <h1 className="type-display text-balance">{recipe.title}</h1>
        <p className="type-caption text-muted-foreground">
          From {sourceHost(recipe.sourceUrl)}
        </p>
      </header>

      {notice === "already-in-library" ? (
        <Alert tone="info">
          <AlertDescription>{ALREADY_IN_LIBRARY_NOTICE}</AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-labelledby="ingredients-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="ingredients-heading" className="type-heading">
          Ingredients
        </h2>
        <ol className="flex flex-col gap-2">
          {recipe.ingredients.map((ingredient, index) => {
            const amount = ingredientAmount(ingredient);
            return (
              <li key={index} className="type-body">
                {amount ? (
                  `${amount} ${ingredient.name}`
                ) : (
                  <>
                    {ingredient.name}{" "}
                    <span className="text-muted-foreground">
                      (amount not given)
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
        <h2 id="steps-heading" className="type-heading">
          Steps
        </h2>
        <ol className="flex list-decimal flex-col gap-3 pl-6 marker:text-muted-foreground">
          {recipe.steps.map((step, index) => (
            <li key={index} className="pl-1 type-body text-pretty">
              {step}
            </li>
          ))}
        </ol>
      </section>

      <Button variant="outline" asChild className="self-start">
        <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
          View the original
          <ExternalLinkIcon aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    </PageContainer>
  );
}
