// PATs are same as better-auth api-keys, but they are used for giving access for pushing and pulling git repos.

import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export const listPersonalAccessTokens = queryOptions({
  queryKey: ["personal-access-tokens"],
  queryFn: async () => {
    const { data, error } = await authClient.apiKey.list();
    if (error) {
      throw new Error(error.message);
    }
    return data;
  },
});
