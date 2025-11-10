import { api } from "@gitvex/backend/convex/_generated/api";
import { getBasicCredentials } from "@/git/protocol";
import { fetchMutation } from "./auth-server";

type VerifyAuthArgs = {
  owner: string;
  repo: string;
  req: Request;
  service: "upload-pack" | "receive-pack";
};

export async function verifyAuth({
  owner,
  repo,
  req,
  service,
}: VerifyAuthArgs) {
  const basic = getBasicCredentials(req);
  const token = basic && basic.username === owner ? basic.password : undefined;

  try {
    const data = await fetchMutation(api.repositories.checkPermissionByPAT, {
      owner,
      repo,
      token,
      service,
    });
    return data.valid;
  } catch {
    return false;
  }
}
