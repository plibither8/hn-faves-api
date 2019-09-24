# Hacker News Favorites API

Quick and dirty Hacker News favorites API to get a users favorited items. Mostly based on, but an extension of [reactual/hacker-news-favorites-api](https://github.com/reactual/hacker-news-favorites-api).

## Usage

**Base URL:** [https://hn-faves.mihir.ch](https://hn-faves.mihir.ch) OR [https://hn-faves.now.sh](https://hn-faves.now.sh).

```text
GET /:user
GET /:user/stories
GET /:user/comments

Optional query parameters:
    all=[true,false]
    limit=<Number>
    offset=<Number>
```
