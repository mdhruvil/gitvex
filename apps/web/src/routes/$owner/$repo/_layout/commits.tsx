import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { CheckIcon, CopyIcon, GitCommitIcon } from "lucide-react";
import { useState } from "react";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { getRepoDOStub } from "@/do/repo";
import { cn } from "@/lib/utils";

const getCommitFnSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ref: z.string().optional(),
  limit: z.number().optional(),
});

const getCommitFn = createServerFn({ method: "GET" })
  .inputValidator(getCommitFnSchema)
  .handler(async ({ data }) => {
    const fullName = `${data.owner}/${data.repo}`;
    const stub = getRepoDOStub(fullName);
    const commits = await stub.getCommits({
      depth: data.limit,
      ref: data.ref,
    });
    return commits;
  });

const getCommitsQueryOptions = (data: z.infer<typeof getCommitFnSchema>) =>
  queryOptions({
    queryKey: ["commits", data.owner, data.repo, data.ref, data.limit].filter(
      Boolean
    ),
    queryFn: async () => await getCommitFn({ data }),
  });

export const Route = createFileRoute("/$owner/$repo/_layout/commits")({
  component: RouteComponent,
  loader: async ({ params, context: { queryClient } }) => {
    await queryClient.ensureQueryData(
      getCommitsQueryOptions({
        owner: params.owner,
        repo: params.repo,
      })
    );
  },
});

function formatRelativeTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatCommitDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isThisYear = date.getFullYear() === now.getFullYear();

  return format(date, isThisYear ? "MMM d" : "MMM d, yyyy");
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <Button onClick={handleCopy} size="icon" variant="outline">
      {copied ? (
        <CheckIcon className="size-4 text-green-600" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </Button>
  );
}

function RouteComponent() {
  const params = Route.useParams();
  const { owner, repo } = params;
  const { data } = useSuspenseQuery(
    getCommitsQueryOptions({
      owner,
      repo,
    })
  );

  type CommitType = (typeof data)[number];

  // Group commits by date
  const groupedCommits = data.reduce(
    (acc, commit) => {
      const dateKey = formatCommitDate(commit.commit.author.timestamp);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(commit);
      return acc;
    },
    {} as Record<string, CommitType[]>
  );

  return (
    <div className="mx-auto max-w-5xl py-6">
      <div className="space-y-8">
        {Object.entries(groupedCommits).map(([date, commits]) => (
          <div key={date}>
            {/* Date Header */}
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold text-foreground text-sm">
                Commits on {date}
              </h2>
            </div>

            {/* Commits List */}
            <div className="divide-y overflow-hidden rounded-lg border">
              {commits.map((commit, index) => {
                const shortHash = commit.oid.substring(0, 7);
                const commitMessage = commit.commit.message.split("\n")[0];

                return (
                  <div
                    className={cn(
                      "group relative flex items-start gap-3 p-4 transition-colors hover:bg-muted/50",
                      index === 0 && "rounded-t-lg",
                      index === commits.length - 1 && "rounded-b-lg"
                    )}
                    key={commit.oid}
                  >
                    {/* Commit Icon */}
                    <div className="mt-1 shrink-0">
                      <GitCommitIcon className="size-4 text-muted-foreground" />
                    </div>

                    {/* Main Content */}
                    <div className="min-w-0 flex-1">
                      {/* Commit Message */}
                      <div className="mb-1">
                        <span className="font-semibold text-foreground">
                          {commitMessage}
                        </span>
                      </div>

                      {/* Author and Time */}
                      <div className="flex flex-wrap items-center gap-1 text-muted-foreground text-xs">
                        <span className="font-medium">
                          {commit.commit.author.name}
                        </span>
                        <span>committed</span>
                        <span>
                          {formatRelativeTime(commit.commit.author.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Commit Hash and Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs">{shortHash}</span>
                      <CopyButton text={commit.oid} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {data.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <GitCommitIcon className="mb-4 size-12 text-muted-foreground" />
            <h3 className="mb-2 font-semibold text-lg">No commits yet</h3>
            <p className="text-muted-foreground text-sm">
              This repository doesn&apos;t have any commits yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
