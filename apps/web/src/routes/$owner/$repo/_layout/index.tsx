import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$owner/$repo/_layout/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      Hello "/$user/$repo/"!
      <Outlet />
    </div>
  );
}
