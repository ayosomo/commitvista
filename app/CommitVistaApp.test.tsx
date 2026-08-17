import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CommitVistaApp } from "./CommitVistaApp";

function renderApp() {
  window.history.replaceState(null, "", "/");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommitVistaApp />
    </QueryClientProvider>,
  );
}

describe("CommitVista search", () => {
  it("explains the product and accepts a GitHub profile URL", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole("heading", { name: /engineering story/i })).toBeInTheDocument();
    const input = screen.getByLabelText(/GitHub username or profile URL/i);
    await user.type(input, "https://github.com/octocat");

    expect(input).toHaveValue("https://github.com/octocat");
    expect(screen.getByRole("button", { name: /build dashboard/i })).toBeEnabled();
  });
});
