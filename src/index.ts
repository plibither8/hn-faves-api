import { Router, Request, Obj } from "itty-router";
import { parse } from "node-html-parser";

interface RequestParams extends Obj {
  id: string;
  type: "comments" | "stories";
}

interface FaveOptions {
  id: string;
  comments: boolean;
  p: number;
}

interface Fave {
  id: string;
  url: string;
  isComment: boolean;
  user?: string;
  title?: string;
}

const router = Router();

const getUrl = (options: FaveOptions): string => {
  const BASE_URL = "https://news.ycombinator.com/favorites";
  const url = new URL(BASE_URL);
  for (const [key, value] of Object.entries(options)) {
    url.searchParams.append(key, String(value));
  }
  return url.toString();
};

const fetchFaves = async (options: FaveOptions): Promise<Fave[]> => {
  const url = getUrl(options);
  const html = await fetch(url, {
    cf: {
      cacheTtl: 86400,
      cacheEverything: true,
    },
  }).then((res) => res.text());
  const faves: Fave[] = parse(html)
    .querySelectorAll(".athing")
    .map((item) => ({
      id: item.getAttribute("id")!,
      url: item
        .querySelector(options.comments ? "span.age a" : "a.storylink")
        ?.getAttribute("href")!,
      isComment: options.comments,
      ...(options.comments
        ? {
            user: item.querySelector(".hnuser")!.text,
          }
        : {
            title: item.querySelector("a.titlelink")!.text,
          }),
    }));
  return faves;
};

const paginateAndCollect = async (
  options: FaveOptions,
  acc: Fave[] = []
): Promise<Fave[]> => {
  const faves = await fetchFaves(options);
  if (faves.length === 0) return acc;
  return paginateAndCollect({ ...options, p: options.p + 1 }, [
    ...acc,
    ...faves,
  ]);
};

router.get("/:id/:type", async (request: Request) => {
  const { id, type } = request.params as RequestParams;

  if (!id) return new Response("Invalid ID", { status: 400 });
  if (!["comments", "stories"].includes(type))
    return new Response("Invalid type", { status: 400 });

  // If cache hit, return cached response
  const cacheKey = request.url;
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) return response;

  const faves = await paginateAndCollect({
    id,
    comments: type === "comments",
    p: 1,
  });
  response = Response.json(faves, {
    headers: {
      "Cache-Control": "max-age=86400",
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
});

router.all("*", () => {
  return new Response(`Usage:
======

GET /:username/stories
GET /:username/comments

Visit https://github.com/plibither8/hn-faves-api for more info.`);
});

export default {
  async fetch(request: Request): Promise<Response> {
    return router.handle(request);
  },
};
