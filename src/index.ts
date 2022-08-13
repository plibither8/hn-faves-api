import { Router, Request, Obj } from "itty-router";
import { HTMLElement, parse } from "node-html-parser";

interface RequestParams extends Obj {
  id: string;
  type: "comments" | "stories";
}

interface FaveOptions {
  id: string;
  comments: boolean;
  p: number;
}

type Fave = {
  id: number;
  url: string;
  type: string;
} & ({ user: string } | { title: string });

const router = Router();

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
): Promise<HTMLElement[]> => {
  const url = getUrl(options);
  const html = await fetch(url).then((res) => res.text());
  const list = parse(html).querySelectorAll(".athing");
  return list;
};

const fetchFaves = {
  stories: async (options: FaveOptions): Promise<Fave[]> => {
    const list = await getFavesHtmlList(options);
    return list.map((item) => ({
      id: Number(item.getAttribute("id")!),
      url: item.querySelector("a.titlelink")!.getAttribute("href")!,
      title: item.querySelector("a.titlelink")!.text,
      type: "story",
    }));
  },
  comments: async (options: FaveOptions): Promise<Fave[]> => {
    const list = await getFavesHtmlList(options);
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
  type: "comments" | "stories",
  options: FaveOptions,
  acc: Fave[] = []
): Promise<Fave[]> => {
  const faves = await fetchFaves[type](options);
  const newAcc = [...acc, ...faves];
  if (faves.length < 30) return newAcc;
  return paginateAndCollect(type, { ...options, p: options.p + 1 }, newAcc);
};

const getCacheKey = (request: Request): string => {
  const { id, type } = request.params as RequestParams;
  const { origin } = new URL(request.url);
  return `${origin}/${id}/${type}`;
};

const respondWithCache = async (request: Request) => {
  const cache = caches.default;
  const cacheKey = getCacheKey(request);
  const response = await cache.match(cacheKey);
  if (response) return response;
};

router.get("/:id/:type", respondWithCache, async (request: Request) => {
  const { id, type } = request.params as RequestParams;

  if (!id) return new Response("Invalid ID", { status: 400 });
  if (!["comments", "stories"].includes(type))
    return new Response("Invalid type", { status: 400 });

  const faves = await paginateAndCollect(type, {
    id,
    p: 1,
    comments: type === "comments",
  });
  const response = Response.json(faves, {
    headers: {
      "Cache-Control": "max-age=86400",
    },
  });

  // Cache the response and return it
  const cache = caches.default;
  const cacheKey = getCacheKey(request);
  await cache.put(cacheKey, response.clone());
  return response;
});

router.get("/:id/:type/delete-cache", async (request: Request) => {
  const cache = caches.default;
  const cacheKey = getCacheKey(request);
  const deleted = await cache.delete(cacheKey);
  return new Response(deleted ? "Cache deleted" : "Cache not found");
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
