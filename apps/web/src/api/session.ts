import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export const getSessionOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    const { data } = await authClient.getSession();
    return data;
  },
});
