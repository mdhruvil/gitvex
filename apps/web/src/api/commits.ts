import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { getRepoDOStub } from "@/do/repo";

export const getCommitFnSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ref: z.string().optional(),
  limit: z.number().optional(),
});

export const getCommitsFn = createServerFn({ method: "GET" })
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

export const getCommitsQueryOptions = (
  data: z.infer<typeof getCommitFnSchema>
) =>
  queryOptions({
    queryKey: ["commits", data.owner, data.repo, data.ref, data.limit].filter(
      Boolean
    ),
    queryFn: async () => await getCommitsFn({ data }),
  });
