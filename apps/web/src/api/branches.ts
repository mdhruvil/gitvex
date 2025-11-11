import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { getRepoDOStub } from "@/do/repo";

export const getBrancesFnSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

export const getBranchesFn = createServerFn({ method: "GET" })
  .inputValidator(getBrancesFnSchema)
  .handler(async ({ data }) => {
    const fullName = `${data.owner}/${data.repo}`;
    const stub = getRepoDOStub(fullName);
    const result = await stub.getBranches();
    return {
      branches: result.branches,
      currentBranch: result.currentBranch,
    };
  });

export const getBranchesQueryOptions = (
  data: z.infer<typeof getBrancesFnSchema>
) =>
  queryOptions({
    queryKey: ["branches", data.owner, data.repo],
    queryFn: async () => await getBranchesFn({ data }),
  });
