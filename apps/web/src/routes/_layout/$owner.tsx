import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/$owner")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_layout/$owner"!</div>;
}
