import { getStaticAuth } from "@convex-dev/better-auth";
import { createAuth } from "../auth";

// Export a static instance for Better Auth schema generation
export const auth = getStaticAuth(createAuth);
