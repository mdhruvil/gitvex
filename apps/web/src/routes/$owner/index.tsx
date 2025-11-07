import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$owner/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/$owner/"!</div>;
}
