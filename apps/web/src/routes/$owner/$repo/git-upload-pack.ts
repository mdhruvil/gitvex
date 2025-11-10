import { createFileRoute } from "@tanstack/react-router";
import { getRepoDOStub } from "@/do/repo";

export const Route = createFileRoute("/$owner/$repo/git-upload-pack")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { owner, repo } = params;
        // Strip .git suffix if present
        const repoName = repo.endsWith(".git") ? repo.slice(0, -4) : repo;
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
