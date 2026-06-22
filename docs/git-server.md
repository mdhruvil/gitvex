# Git Server Architecture

Gitflare implements a Git smart HTTP server entirely on Cloudflare Workers, using SQLite-backed Durable Objects for per-repository storage. This document explains the technical architecture in detail.

## Architecture Overview

```
Git Client (clone/push/pull)
      │  HTTP Smart Protocol
      ▼
Cloudflare Worker (TanStack Start routes)
      │  Auth check via Better Auth PAT
      ▼
Repo Durable Object (1 DO per repository)
      │  isomorphic-git + DOFS filesystem
      ▼
Durable Object SQLite storage (git objects, refs, packfiles)
```

There are three layers:

1. **HTTP Route Layer** — TanStack Start server routes that handle incoming Git HTTP requests and enforce authentication.
2. **Git Protocol Layer** — A from-scratch implementation of the Git wire protocol (pkt-line format, protocol v2 for fetch, protocol v0/v1 for push).
3. **Durable Object Layer** — One Durable Object instance per repository, owning all git state via isomorphic-git and a custom filesystem adapter over DO SQLite storage.

## HTTP Route Layer

Three routes implement the Git smart HTTP protocol. All live under `apps/web/src/routes/$owner/$repo/`.

### `GET /:owner/:repo/info/refs?service=git-upload-pack|git-receive-pack`

File: `apps/web/src/routes/$owner/$repo/info/refs.ts`

This is the initial handshake endpoint. When a client runs `git clone`, `git fetch`, or `git push`, it first hits this endpoint with the appropriate `service` query parameter.

- Validates the `service` parameter (`git-upload-pack` for read, `git-receive-pack` for write).
- Strips the `.git` suffix from the repo name if present.
- Calls `verifyAuth()` for permission checking.
- If unauthorized, returns `401` with `WWW-Authenticate: Basic realm="Git"` to prompt the client for credentials.
- If authorized, calls `advertiseCapabilities()` to send the server's capabilities and ref list.

### `POST /:owner/:repo/git-upload-pack`

File: `apps/web/src/routes/$owner/$repo/git-upload-pack.ts`

Handles the actual fetch/clone data exchange using Git Protocol v2. After auth verification, it forwards the request body directly to the Repo Durable Object via `stub.fetch("https://do/git-upload-pack", ...)`.

### `POST /:owner/$repo/git-receive-pack`

File: `apps/web/src/routes/$owner/$repo/git-receive-pack.ts`

Handles push data exchange. Same pattern as upload-pack: auth check, then forward the request body to the Repo Durable Object.

The routes construct the full repo name as `owner/repo`, which is used as the Durable Object identifier via `getRepoDOStub()` in `apps/web/src/do/repo.ts`.

## Authentication

File: `apps/web/src/lib/git-auth.ts`

Authentication uses **HTTP Basic Authentication** with **Personal Access Tokens (PATs)** verified via Better Auth's `verifyApiKey` API.

### How credentials are extracted

The `getBasicCredentials()` function in `apps/web/src/git/protocol.ts` decodes the `Authorization: Basic <base64>` header. The PAT is taken from the password field where `username === owner`.

### Permission rules

| Operation | Service | Public Repo | Private Repo |
|-----------|---------|-------------|--------------|
| Pull/Fetch | `upload-pack` | Anonymous allowed | Owner only (PAT required) |
| Push | `receive-pack` | Owner only (PAT required) | Owner only (PAT required) |

- Push always requires authentication, regardless of repo visibility.
- Pull on public repos is allowed anonymously.
- Pull on private repos requires authentication (owner only).
- Only the repository owner can push or access private repos.

## Git Protocol Layer

Files: `apps/web/src/git/pkt.ts`, `apps/web/src/git/protocol.ts`

This is a from-scratch implementation of the Git wire protocol. No external Git server binary is used.

### Pkt-Line Format

File: `apps/web/src/git/pkt.ts`

The `PktLine` class implements the pkt-line encoding format used by all Git protocol communication.

**Format**: 4-byte hexadecimal length prefix + payload. The length includes the 4-byte header itself.

**Special packets**:
- `0000` — Flush packet (end of message)
- `0001` — Delimiter packet (separates sections)
- `0002` — Response-end packet (end of response for stateless connections)

**Size limits**:
- Maximum total packet size: 65,520 bytes
- Maximum payload size: 65,516 bytes (65,520 - 4 byte header)

**Side-band multiplexing** (used during packfile transfer):
- Channel 1: Packfile data
- Channel 2: Progress messages
- Channel 3: Error messages
- Maximum side-band payload: 65,515 bytes (65,516 - 1 byte for channel identifier)

Key methods:
- `PktLine.encode(data)` — Encode a string or Uint8Array into pkt-line format
- `PktLine.encodeFlush()` / `encodeDelim()` / `encodeResponseEnd()` — Encode special packets
- `PktLine.encodeSideband(channel, data)` — Encode side-band multiplexed data
- `PktLine.encodeProgress(message)` — Helper for channel 2 progress messages
- `PktLine.decode(buffer)` — Decode a pkt-line from a buffer, returning a discriminated union packet type
- `PktLine.mergeLines(lines)` — Merge multiple pkt-line packets into a single buffer

### Protocol v2 (Upload Pack / Fetch)

The server advertises Git Protocol v2 capabilities for `git-upload-pack`:

```
version 2
agent=gitflare/0.0.1
ls-refs
fetch
side-band-64k
object-format=sha1
```

Two sub-commands are handled inside the DO's `uploadPack()` method:

#### `ls-refs`

Lists all refs (HEAD, branches, tags) with their OIDs. Supports:
- `peel` — Returns peeled references for annotated tags (the commit the tag points to)
- `symrefs` — Returns the symbolic ref target for HEAD (e.g., `symref-target:refs/heads/main`)
- `ref-prefix <prefix>` — Filters refs by prefix (used by clients to minimize data transfer)

#### `fetch`

The core clone/fetch operation. Flow:

1. **Parse the fetch request** — Extract `want` lines (objects the client wants), `have` lines (objects the client already has), capabilities (`thin-pack`, `no-progress`, `include-tag`, `ofs-delta`, `sideband-all`), shallow options, and filter specs.
2. **Find common commits** — Check if the server has each `have` OID. This determines what the client already has and what needs to be sent.
3. **Collect objects for packfile** — If the client sent `done`, walk the object graph from all `wants` excluding all `haves` using BFS traversal:
   - **Commits**: Add tree OID and parent commit OIDs to the queue
   - **Trees**: Add all entry OIDs (subtrees and blobs) to the queue
   - **Tags**: Add the referenced object OID to the queue
   - **Blobs**: Add to the object set (no further traversal needed)
   - Objects already in the `have` set are skipped (not included and not traversed further)
4. **Pack objects** — Use `isomorphic-git`'s `packObjects()` to create a packfile from the collected OIDs.
5. **Build the response**:
   - If `done` was not sent: include an acknowledgments section with `ACK <oid>` for each common commit (or `NAK` if none), followed by `ready` and a delimiter.
   - If `done` was sent: skip acknowledgments entirely (per protocol v2 spec).
   - Packfile section: send `packfile` header, optional progress messages, then multiplex the packfile data over side-band-64k in 65,515-byte chunks.
   - End with a flush packet.

### Protocol v0/v1 (Receive Pack / Push)

The server uses the older protocol for receive-pack (protocol v2 support is planned but not yet implemented).

Capabilities advertised:
```
report-status
delete-refs
atomic
no-thin
agent=gitflare/0.0.1
symref=HEAD:refs/heads/main
```

For empty repositories, a zero OID (`0000000000000000000000000000000000000000`) is advertised with `capabilities^{}`.

The `receivePack()` method handles the push:

1. **Parse the receive-pack request** — Extract commands (`<old-oid> <new-oid> <ref>`), capabilities, and the packfile from the raw request data.
2. **Write the packfile** — Save the received packfile to `/repo/objects/pack/pack-<timestamp>.pack`.
3. **Index the packfile** — Run `git.indexPack()` to make the packfile's objects accessible to isomorphic-git. If this fails, return an `unpack` error status.
4. **Apply ref updates** — Validate and apply each command:
   - **Create** (old OID = zero): Ref must not already exist.
   - **Delete** (new OID = zero): Ref must exist.
   - **Update**: Ref must exist, old OID must match current, and the update must be a fast-forward (checked via `git.isDescendent()`).
   - **Atomic mode**: If the `atomic` capability was negotiated and any command fails, all commands fail.
   - Successful updates are applied via `git.writeRef()` (with `force: true`) or `git.deleteRef()`.
5. **Return report-status** — Send `unpack ok` (or `unpack <error>`), then per-ref `ok <ref>` or `ng <ref> <error>` lines, terminated by a flush packet.

## Durable Object: Repository Storage

File: `apps/web/src/do/repo.ts`

Each repository is a **separate Durable Object instance** (SQLite-backed), identified by `owner/repoName`. The DO is defined in `apps/web/alchemy.run.ts`:

```ts
const repoDO = DurableObjectNamespace("repos", {
  className: "Repo",
  sqlite: true,
});
```

The `RepoBase` class extends `DurableObject<Env>` and is exported as `Repo` with Sentry instrumentation.

### Initialization

On first activation, `blockConcurrencyWhile` runs:
1. Sets the DOFS device size to 5GB (to support large repositories).
2. Checks if `/repo/HEAD` exists; if not, initializes a bare git repository with `git.init({ bare: true, defaultBranch: "main" })`.
3. Loads the stored `fullName` from DO storage.

### Request routing

The DO's `fetch()` method routes requests:
- `POST /git-upload-pack` → `uploadPack(data)`
- `POST /git-receive-pack` → `receivePack(data)`
- Anything else → `404`

### Caching

File: `apps/web/src/do/cache.ts`

Read operations are cached using **Cloudflare's Cache API** (the same cache that powers the CDN edge cache). The cache module exposes three functions: `getJson`, `putJson`, and `getOrSetJson` (a read-through cache helper).

#### Cache namespace

A named cache partition is opened via `caches.open("gitflare:json")`. This isolates gitflare's cached data from other workers on the same edge.

#### Cache key construction

Cache keys are built as URLs (required by the Cache API) using the pattern:

```
{SITE_URL}/__cache/{key}?{params}
```

- The `key` is the base identifier (e.g., `owner/repo/commits`, `owner/repo/blob`, `owner/repo/commit/<oid>`). A leading `/` is added if missing.
- `params` are serialized as URL query parameters. Only non-undefined values are included.
- `SITE_URL` is the worker's site URL binding, ensuring keys are unique per deployment (production vs. preview vs. local).

#### TTL and headers

Cached responses are stored with:
- `Content-Type: application/json`
- `Cache-Control: public, max-age=<ttl>` — default TTL is 1 year (31,536,000 seconds). No per-operation TTL overrides are currently used.

#### Null/undefined handling

`getOrSetJson` does not cache `null` or `undefined` values. If the fetcher returns null (e.g., a blob that doesn't exist), the result is returned without caching, so subsequent requests will re-fetch.

#### Cached operations

Each cached operation uses a different invalidation strategy via its cache key params:

| Operation | Cache Key | Params | Invalidation Strategy |
|-----------|-----------|--------|----------------------|
| `getCommits` | `{fullName}/commits` | `ref`, `depth`, `filepath`, `latestCommitOid` | Includes the latest commit OID on the branch. When a new commit is pushed, the latest commit OID changes, producing a new cache key. Old entries expire after 1 year. |
| `getTree` | `{fullName}/treeWithLastCommit` | `resolvedRef`, `path` | Keyed by the resolved ref OID. When the ref is updated (new commit), the resolved OID changes, producing a new cache key. |
| `getBlob` | `{fullName}/blob` | `resolvedRef`, `filepath` | Same as tree — keyed by resolved ref OID, so new commits invalidate the cache. |
| `getCommit` | `{fullName}/commit/{commitOid}` | _(none)_ | Keyed directly by commit OID. Commits are immutable, so this cache never needs invalidation. |

#### What is NOT cached

- `getLatestCommit` — Always fetched fresh (used as the invalidation key for `getCommits`).
- `getBranches` — Always fetched fresh.
- All git protocol operations (`uploadPack`, `receivePack`) — Never cached; they operate on live git data.
- `listRefs` (used during protocol advertisement) — Never cached.

### Additional DO methods (for web UI)

The DO also exposes methods used by the web frontend (not the git protocol):
- `getLatestCommit(branch)` — Latest commit on a branch
- `getCommits({ ref, depth, filepath })` — Commit history
- `getBranches()` — Branch list + current branch
- `getTree({ ref, path })` — Directory listing with last commit per entry
- `getBlob({ ref, filepath })` — File content with binary detection
- `getCommit(commitOid)` — Commit with file diff (add/modify/remove changes)

## Filesystem Layer

File: `apps/web/src/do/fs.ts`

The `IsoGitFs` class bridges **DOFS** (Durable Object File System) with **isomorphic-git**'s expected Node.js `fs.promises` API.

### DOFS

DOFS is a virtual filesystem backed by Durable Object SQLite storage. It is initialized with a 512KB chunk size. All git data (loose objects, packfiles, refs, HEAD, config) lives inside the DO's SQLite storage at the `/repo` path.

### IsoGitFs adapter

The adapter implements these methods:
- `readFile(path, options)` — Read file content (returns Buffer or string)
- `writeFile(filepath, data, options)` — Write data to file
- `unlink(path)` — Delete a file
- `readdir(path)` — List directory contents
- `mkdir(path, options)` — Create a directory (always recursive)
- `rmdir(path, options)` — Remove a directory
- `stat(path)` — File/directory stats (follows symlinks)
- `lstat(path)` — File/directory stats (does not follow symlinks)
- `readlink(path)` — Read symlink target
- `symlink(target, path)` — Create a symlink

Key implementation details:
- **Path normalization**: Resolves `.`, `..`, ensures leading `/`, strips query/hash fragments.
- **Error annotation**: Wraps DOFS errors with Node.js-style error codes (`ENOENT`, `EISDIR`, `EEXIST`, etc.) since isomorphic-git checks `error.code` to handle missing files and other conditions.
- **Stats object**: Constructs a Node.js-compatible `Stats` object from DOFS stat data, including file type detection, timestamps, and size.

## GitService

File: `apps/web/src/git/service.ts`

A wrapper around `isomorphic-git` that provides all git operations. It is instantiated per-request within the Durable Object with the DOFS-backed filesystem and the gitdir set to `/repo`.

### Operations

**Repository management**:
- `initRepo()` — Initialize a bare git repository
- `listRefs()` — List all refs (HEAD, branches, tags) with OIDs and symbolic HEAD
- `listBranches()` / `listBranchesWithOid()` — List branches
- `listTags()` — List tags with OIDs
- `currentBranch()` — Get current branch name

**Object operations**:
- `readObject(oid)` — Read any git object by OID
- `readObjectForLsRefs(oid)` — Read object for ls-refs (ensures content format)
- `readBlob(oid, filepath)` — Read file content with binary detection
- `readTree(oid, filepath)` — Read tree entries
- `readCommit(oid)` — Read commit object
- `readTag(oid)` — Read tag object
- `hasObject(oid)` — Check if object exists

**Pack operations**:
- `collectObjectsForPack(wants, haves)` — BFS traversal of the object graph from wants, excluding haves
- `packObjects(oids)` — Create a packfile from a list of OIDs
- `indexPack(filePath)` — Index a packfile to make its objects accessible

**Ref management**:
- `applyRefUpdates(commands, atomic)` — Validate and apply ref updates (create, delete, update with fast-forward check)
- `resolveRef(ref)` — Resolve a ref to an OID
- `expandRef(ref)` — Expand a short ref to a full ref

**History and diff**:
- `getLog({ ref, depth, filepath })` — Commit history
- `getCommit(commitOid)` — Commit with file changes compared to parent
- `getFileStateChanges(oldCommit, newCommit)` — Diff two commits using `git.walk()`, returns add/modify/remove changes with file content
- `getLastCommit(branch)` — Latest commit on a branch

**Binary detection**:
- `detectBinary(content)` — Checks first 8000 bytes for null bytes (standard git heuristic)

## Infrastructure

File: `apps/web/alchemy.run.ts`

The project uses [Alchemy](https://alchemy.run) for infrastructure-as-code. The deployment defines:
- A `DurableObjectNamespace` named `repos` with SQLite enabled, bound as `REPO`
- A `D1Database` named `gitflare-db` for metadata (users, repos, issues, comments), bound as `DB`
- A `TanStackStart` worker with all bindings, deployed to a custom domain in production

The Durable Object class `Repo` is exported from the server entry (`apps/web/src/server.ts`) so Cloudflare can route DO requests to it.

## Data Flow Summary

### Clone/Fetch (git pull)

```
1. Client: GET /owner/repo/info/refs?service=git-upload-pack
2. Server: Advertise v2 capabilities (ls-refs, fetch, side-band-64k, object-format=sha1)
3. Client: POST /owner/repo/git-upload-pack  →  command=ls-refs
4. Server: Return ref list (HEAD, branches, tags) with OIDs
5. Client: POST /owner/repo/git-upload-pack  →  command=fetch, wants=[...], haves=[...], done
6. Server (DO):
   a. Find common commits (which haves does the server have?)
   b. BFS from wants, excluding haves → collect all needed objects
   c. Pack objects into a packfile
   d. Build response: acknowledgments (if not done) + packfile over side-band-64k
7. Client receives packfile, unpacks, and updates local refs
```

### Push (git push)

```
1. Client: GET /owner/repo/info/refs?service=git-receive-pack
2. Server: Advertise v0/v1 capabilities (report-status, delete-refs, atomic, no-thin) + current refs
3. Client: POST /owner/repo/git-receive-pack  →  commands + packfile
4. Server (DO):
   a. Parse commands (old-oid new-oid ref) and packfile
   b. Write packfile to /repo/objects/pack/
   c. Index packfile (make objects accessible)
   d. Validate ref updates (create/delete/fast-forward checks)
   e. Apply ref updates (writeRef/deleteRef)
   f. Return report-status (unpack ok/ng + per-ref ok/ng)
5. Client updates remote tracking refs
```
