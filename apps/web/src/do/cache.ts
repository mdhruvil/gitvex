import { env } from "cloudflare:workers";
import { createLogger } from "./logger";

const logger = createLogger("Cache");

async function getJsonCache(): Promise<Cache> {
  const cache = await caches.open("gitflare:json");
  return cache;
}

type Params = Record<string, string | undefined>;

type BuildCacheKeyArgs = {
  key: string;
  params: Params;
};

function buildCacheKey({ key, params }: BuildCacheKeyArgs) {
  const path = key.startsWith("/") ? key : `/${key}`;
  const url = new URL(`/__cache${path}`, env.SITE_URL);
  // biome-ignore lint/suspicious/useGuardForIn: <idc>
  for (const param in params) {
    const value = params[param];
    if (value) url.searchParams.set(param, value);
  }
  return url;
}

type PutJsonArgs<T> = {
  /**
   * The base key for the cached item.
   * If the key does not start with `/`, it will also be added automatically.
   */
  key: string;
  /**
   * The data to be cached.
   */
  data: T;
  /**
   * Optional parameters to include in the cache key.
   */
  params?: Params;
  options?: {
    /**
     * Time to live in seconds for the cached item.
     * @default 1 year
     */
    ttlSeconds?: number;
  };
};

async function putJson<T>({ key, data, params, options }: PutJsonArgs<T>) {
  const ttl = options?.ttlSeconds ?? 60 * 60 * 24 * 365; // 1 year;
  const cache = await getJsonCache();
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": `public, max-age=${Math.floor(ttl)}`,
  });
  const response = new Response(JSON.stringify(data), { headers });
  const finalKey = buildCacheKey({
    key,
    params: params ?? {},
  });
  await cache.put(finalKey, response);
  logger.debug(`Cached data for key: ${finalKey.toString()}`);
}

type GetJsonArgs = {
  key: string;
  params?: Params;
};

async function getJson<T>({ key, params }: GetJsonArgs): Promise<T | null> {
  const cache = await getJsonCache();
  const finalKey = buildCacheKey({
    key,
    params: params ?? {},
  });
  const response = await cache.match(finalKey);
  if (!response || !response.ok) return null;
  const data = (await response.json()) as T;
  logger.debug("Cache hit for key: ", finalKey.toString());
  return data;
}

type GetOrSetJsonArgs<T> = {
  /**
   * The base key for the cached item.
   * If the key does not start with `/`, it will also be added automatically.
   */
  key: string;
  /**
   * Function to fetch the data if it's not in the cache.
   * Must resolve to the data to be cached.
   */
  fetcher: () => Promise<T> | T;
  /**
   * Optional parameters to include in the cache key.
   */
  params?: Params;
  options?: {
    /**
     * Time to live in seconds for the cached item.
     * @default 1 year
     */
    ttlSeconds?: number;
  };
};

async function getOrSetJson<T>({
  key,
  fetcher,
  options,
  params,
}: GetOrSetJsonArgs<T>): Promise<T> {
  const cached = await getJson<T>({ key, params });
  if (cached) return cached;

  const fresh = await fetcher();
  if (fresh === null || fresh === undefined) {
    return fresh;
  }
  await putJson({ key, data: fresh, params, options });
  return fresh;
}

export const cache = {
  putJson,
  getJson,
  getOrSetJson,
};
