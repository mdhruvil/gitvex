import { createFileRoute } from "@tanstack/react-router";
import { getRepoDOStub } from "@/do/repo";
import { verifyAuth } from "@/lib/git-auth";

export const Route = createFileRoute("/$owner/$repo/git-upload-pack")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { owner, repo } = params;
        const repoName = repo.endsWith(".git") ? repo.slice(0, -4) : repo;

        // Verify authentication for read access (allows anonymous for public repos)
        const isAuthorized = await verifyAuth({
          owner,
          repo: repoName,
          req: request,
          service: "upload-pack",
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
          "application/x-git-upload-pack-request";

        return stub.fetch("https://do/git-upload-pack", {
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
