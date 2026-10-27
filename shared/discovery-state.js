// Public discovery state; an API failure is never converted into fake/empty results.
export function discoveryState({
  loading,
  error,
  categories = [],
  providers = [],
  city,
  resultCount,
  scope = "providers",
}) {
  if (error) return "error";
  if (loading) return "loading";
  if (!categories.length) return "empty-catalog";
  if (scope === "catalog") return "ready";
  if (!city) return "select-city";
  if (!providers.length) return "empty-city";
  if (resultCount === 0) return "no-results";
  return "ready";
}

export function popularCategories(categories = []) {
  const priority = ["plumbing", "cleaning", "electrical"];
  return categories
    .filter((c) => c.enabled !== false)
    .map((c, index) => ({
      c,
      rank: priority.includes(c.slug)
        ? priority.indexOf(c.slug)
        : priority.length + index,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map(({ c }) => c);
}
