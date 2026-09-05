# Fixing `Error 400: redirect_uri_mismatch`

> You can't sign in because this app sent an invalid request.
> Error 400: redirect_uri_mismatch

Google shows this when the `redirect_uri` the MIS backend put in the consent URL
is not, **character for character**, one of the *Authorized redirect URIs* on the
OAuth client in Google Cloud Console.

Nothing in MIS is broken when this happens, and nothing is logged: Google rejects
the request before it ever redirects back, so the `/callback` routes never run.
The mismatch lives entirely in configuration — either the env var on the server or
the list in Google Cloud Console.

## 1. Ask the server what it is sending

Signed in to MIS, call:

```
GET https://misbackend-e078.onrender.com/api/google-oauth/redirect-uris
Authorization: Bearer <your MIS token>
```

It returns the exact string each Google flow sends, the origin the server is
actually reachable at, and a `problems` list per flow that names the differences
Google treats as a mismatch even when the URIs look identical — a trailing slash,
`http` instead of `https`, a stray space, or a path that no longer matches where
the callback route is mounted. No credential is exposed; the client ID and secret
are reported only as present/absent.

## 2. Register those URIs in Google Cloud Console

Google Cloud Console → **APIs & Services** → **Credentials** → the **OAuth 2.0
Client ID** used by MIS → **Authorized redirect URIs** → paste each value from
`authorizedRedirectUris`, then **Save**.

`authorizedRedirectUris` is the corrected list: a flow reported without problems
contributes the URI it actually sends, and a flow reported *with* problems
contributes the URI it should be sending — so any flagged flow also needs its
`*_REDIRECT_URI` env var on the server updated to that same value, not just the
Console entry.

All three Google flows share one OAuth client (`GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`) but each has its own callback, so all three URIs must be
listed:

| Flow         | Env var               | Callback route (production)                                              |
| ------------ | --------------------- | ------------------------------------------------------------------------ |
| Google Drive | `GOOGLE_REDIRECT_URI` | `https://misbackend-e078.onrender.com/api/google-drive/callback`         |
| Gmail        | `GMAIL_REDIRECT_URI`  | `https://misbackend-e078.onrender.com/api/gmail/callback`                |
| YouTube      | `YOUTUBE_REDIRECT_URI`| `https://misbackend-e078.onrender.com/api/social/providers/youtube/callback` |

Changes in Console can take a few minutes to take effect. Retry the connect flow
after saving.

## 3. If the URIs already match

Then the redirect URI is not the problem — check that the request is going to the
OAuth client you edited. `GOOGLE_CLIENT_ID` on the server and the client ID whose
redirect list you just edited must be the same one; two clients in the same
project are easy to mix up. The `client_id` parameter in the consent URL that
failed tells you which one was actually used.

## Local development

The same rules apply, so a developer host needs its own entries — for example
`http://localhost:5000/api/gmail/callback`. `http` is accepted by Google only for
`localhost`. Point the `*_REDIRECT_URI` env vars at the local backend and add
those URIs to the Console list alongside the production ones.
