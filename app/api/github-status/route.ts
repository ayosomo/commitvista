const GITHUB_STATUS_SUMMARY = "https://www.githubstatus.com/api/v2/summary.json";

export async function GET() {
  const response = await fetch(GITHUB_STATUS_SUMMARY, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    return Response.json(
      { message: "GitHub Status is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(await response.json(), {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
