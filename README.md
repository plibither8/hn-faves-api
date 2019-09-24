# Hacker News Favorites API

Quick and dirty Hacker News favorites API to get a users favorited items. Mostly based on, but an extension of [reactual/hacker-news-favorites-api](https://github.com/reactual/hacker-news-favorites-api).

## Usage

```text
GET /:user
GET /:user/stories
GET /:user/comments

Optional query parameters:
    all=[true,false]
    limit=<Number>
    offset=<Number>
```
