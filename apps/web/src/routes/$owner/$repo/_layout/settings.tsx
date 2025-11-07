import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$owner/$repo/_layout/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/$owner/$repo/_layout/settings"!</div>;
}
