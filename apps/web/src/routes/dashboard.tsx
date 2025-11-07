import { convexQuery } from "@convex-dev/react-query";
import { api } from "@gitvex/backend/convex/_generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(convexQuery(api.auth.getCurrentUser, {}));
    console.log("Dashboard loader executed");
  },
});

function RouteComponent() {
  const { data: privateData } = useSuspenseQuery(
    convexQuery(api.auth.getCurrentUser, {})
  );

  return (
    <div>
      <h1>Dashboard</h1>
      <p>privateData</p>
      <pre>{JSON.stringify(privateData, null, 2)}</pre>
    </div>
  );
}
