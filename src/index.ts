import { Hono } from "hono";
import { HTMLElement, parse } from "node-html-parser";

type FaveType = "comments" | "stories";

interface FaveOptions {
  id: string;
  comments: boolean;
  p: number;
}

type Fave = {
  id: number;
  url: string;
  type: string;
} & (
  | { user: string }
  | {
      title: string;
      hnUrl: string;
    }
);

const MAX_RETRIES = 5;

const app = new Hono();

const getUrl = (options: FaveOptions): string => {
  const BASE_URL = "https://news.ycombinator.com/favorites";
  const url = new URL(BASE_URL);
  for (const [key, value] of Object.entries(options)) {
    url.searchParams.append(key, String(value));
  }
  return url.toString();
};

const getFavesHtmlList = async (
  options: FaveOptions
): Promise<HTMLElement[] | null> => {
  const url = getUrl(options);
  const res = await fetch(url);
  const html = await res.text();
  if (html.length === 0) return null;
  const root = parse(html);
  const list = root.querySelectorAll(".athing");
  if (!list.length) {
    const ERROR_STRING =
      "Sorry, we're not able to serve your requests this quickly.";
    const errorCell = root.querySelector(
      "body > center > table > tr:nth-child(3) > td"
    );
    if (errorCell?.text.trim() === ERROR_STRING) return null;
  }
  return list;
};

const fetchFaves: Record<
  FaveType,
  (options: FaveOptions) => Promise<Fave[] | null>
> = {
  stories: async (options) => {
    const list = await getFavesHtmlList(options);
    if (!list) return null;
    return list.map((item) => ({
      id: Number(item.getAttribute("id")!),
      url: item.querySelector("a.titlelink")!.getAttribute("href")!,
      hnUrl: `https://news.ycombinator.com/item?id=${item.getAttribute("id")}`,
      title: item.querySelector("a.titlelink")!.text,
      type: "story",
    }));
  },
  comments: async (options) => {
    const list = await getFavesHtmlList(options);
    if (!list) return null;
    return list.map((item) => ({
      id: Number(item.getAttribute("id")!),
      url: `https://news.ycombinator.com/${item
        .querySelector("span.age a")
        ?.getAttribute("href")!}`,
      user: item.querySelector(".hnuser")!.text,
      type: "comment",
    }));
  },
};

const paginateAndCollect = async (
  type: FaveType,
  options: FaveOptions,
  acc: Fave[] = [],
  retriesRemaining = MAX_RETRIES
): Promise<Fave[]> => {
  const faves = (await fetchFaves[type](options)) ?? [];
  if (!faves) {
    // Quadratic backoff: 1s, 2s, 4s, 8s, 16s
    const retryDelay = Math.pow(2, MAX_RETRIES - retriesRemaining) * 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
    return retriesRemaining > 0
      ? paginateAndCollect(type, options, acc, retriesRemaining - 1)
      : acc;
  }
  const newAcc = [...acc, ...faves];
  if (faves.length < 30) return newAcc;
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  return paginateAndCollect(type, { ...options, p: options.p + 1 }, newAcc);
};

const getCacheKey = (request: Request<"id" | "type">): string => {
  const { id, type } = request.param();
  const { origin } = new URL(request.url);
  return `${origin}/${id}/${type}`;
};

app.get("/:id/:type", async (ctx) => {
  const cache = caches.default;
  const cacheKey = getCacheKey(ctx.req);
  let response = await cache.match(cacheKey);
  if (response) return response;

  const { id, type } = ctx.req.param();
  if (!id) return ctx.text("Invalid ID", 400);
  if (!["comments", "stories"].includes(type))
    return ctx.text("Invalid type", 400);

  const faves = await paginateAndCollect(type as FaveType, {
    id,
    p: 1,
    comments: type === "comments",
  });
  response = ctx.json(faves, 200, {
    "Cache-Control": "max-age=86400",
  });

  // Cache the response and return it
  ctx.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
});

app.get("/:id/:type/delete-cache", async (ctx) => {
  const cache = caches.default;
  const cacheKey = getCacheKey(ctx.req);
  const deleted = await cache.delete(cacheKey);
  return ctx.text(deleted ? "Cache deleted" : "Cache not found");
});

app.all("*", (ctx) =>
  ctx.text(`Usage:
======

GET /:username/stories
GET /:username/comments

Visit https://github.com/plibither8/hn-faves-api for more info.`)
);

export default app;
