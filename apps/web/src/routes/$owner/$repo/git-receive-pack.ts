import { createFileRoute } from "@tanstack/react-router";
import { getRepoDOStub } from "@/do/repo";
import { verifyAuth } from "@/lib/git-auth";

export const Route = createFileRoute("/$owner/$repo/git-receive-pack")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { owner, repo } = params;
        const repoName = repo.endsWith(".git") ? repo.slice(0, -4) : repo;

        // Verify authentication for write access (always requires auth)
        const isAuthorized = await verifyAuth({
          owner,
          repo: repoName,
          req: request,
          service: "receive-pack",
        });

        if (!isAuthorized) {
          return new Response("Unauthorized", {
            status: 401,
            headers: {
              "WWW-Authenticate": 'Basic realm="Git"',
            },
          });
        }

        const stub = getRepoDOStub(`${owner}/${repoName}`);
        const contentType =
          request.headers.get("Content-Type") ??
          "application/x-git-receive-pack-request";

        return stub.fetch("https://do/git-receive-pack", {
          method: "POST",
          body: request.body,
          signal: request.signal,
          headers: {
            "Content-Type": contentType,
          },
        });
      },
    },
  },
});
