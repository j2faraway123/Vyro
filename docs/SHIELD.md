# Vyro Shield

Vyro Shield is Vyro's optional, built-in ad and tracker blocker. It is **off by
default**. You switch it on in **Settings → Vyro Shield** or on the **Web**
page.

## What it filters, and what it never touches

Shield filters only **Vyro web windows**, the separate browser windows you
open from the Web page to visit music sites such as Bandcamp, SoundCloud or
radio directories.

It never filters:

- the main Vyro window, its interface or its own network requests (lyrics
  lookups, filter-list downloads);
- local music files, artwork or anything served from your disk;
- audio and video streams. Media requests are always allowed;
- the page you navigate to (top-level documents);
- sign-in, DRM, licence or subscription checks. Shield does not rewrite,
  replay or alter any request. It can only let a request through or refuse it.

**YouTube Music window.** Shield leaves it alone by default, so ads play as
they do on the website (YouTube Music Premium removes them). You can opt in
with **Settings → Vyro Shield → Also filter the YouTube Music window**. Shield
then applies the same lists there: it refuses matching requests and hides
matching elements, nothing more. It doesn't inject scripts into YouTube's
player or rewrite its responses, and media requests are still always allowed,
so ads that YouTube streams like songs will probably still play. Filtering
YouTube goes against YouTube's terms of service and can break playback or
sign-in when YouTube changes its site; switch the option off, or add
`music.youtube.com` to the allowlist, if that happens. The option takes effect
straight away, without reopening the window.

It does not promise ad-free playback on third-party streaming services. Ads
that a service plays inside its own audio or video stream are part of that
stream and are deliberately left alone. Vyro does not circumvent any
service's access controls, paywalls or subscription requirements.

Web windows run without access to Vyro's internal commands and use a separate
browser profile (`web-profile` in Vyro's data folder). Sites you sign in to
there can't see your library, and the main app is unaffected.

## How it works on each platform

| | Windows (WebView2) | Linux (WebKitGTK) | macOS (WKWebView) |
| --- | --- | --- | --- |
| Network blocking | Yes. Each request is matched by Brave's `adblock` engine in `WebResourceRequested`; blocked requests get an empty 403 response. | Yes. Your lists are compiled into WebKit content-blocker rules (`UserContentFilterStore`) and applied to the window. | **No.** Not implemented yet. |
| Element hiding (cosmetic rules) | Yes | Yes | Yes |
| Pop-up blocking | Yes | Yes | Yes |
| Per-window blocked counts | Yes | Pop-ups only. WebKit doesn't report which requests its content filter blocked. | Pop-ups only |

Vyro shows the same information in **Settings → Vyro Shield** and on the Web
page, so nothing claims more than the platform can do.

Known limits on every platform:

- Blocking is only as good as the lists. New ad domains appear daily, and
  first-party or server-side ads can't be told apart from content.
- Rules using advanced adblock syntax (scriptlets, `$redirect`, `$replace`,
  `$csp`, procedural cosmetic filters such as `:has-text()`) are not applied.
  The matching engine parses them, but Vyro doesn't inject scriptlets or
  rewrite responses, on purpose.
- On Linux, WebKit compiles the rules into a content blocker, and very large
  combinations of lists can fail to compile. Vyro then logs the error and
  leaves the window unfiltered rather than half-filtered. The first compile
  after a list change takes a few seconds, and the result is cached.

## Filter lists

Defaults (all public, reputable and free to use):

| List | Purpose | Default | Licence |
| --- | --- | --- | --- |
| [EasyList](https://easylist.to/) | Ads | On | GPLv3 or CC BY-SA 3.0 |
| [EasyPrivacy](https://easylist.to/) | Trackers | On (when *Third-party tracker protection* is on) | GPLv3 or CC BY-SA 3.0 |
| [Peter Lowe's list](https://pgl.yoyo.org/adservers/) | Ad and tracking servers | Off | Free for personal use; see the site's terms |
| [Fanboy's Annoyance List](https://easylist.to/) | Cookie banners, pop-ups, social widgets | Off | GPLv3 or CC BY-SA 3.0 |

- Lists download over HTTPS only. A download that returns an HTML page
  instead of a filter list, which usually means a captive portal or an error
  page, is rejected.
- Lists are stored in Vyro's data folder under `shield/`. If an update fails,
  the previously downloaded copy keeps working, and the error is shown next
  to the list.
- **Update all** downloads every enabled list again. While Shield is on,
  Vyro also refreshes missing lists and lists more than 4 days old in the
  background each time it starts.
- You can add any HTTPS list in Adblock Plus format, and remove lists you
  added.

## When a site breaks

1. Add the site to the **Allowlist** (Settings → Vyro Shield). Shield is fully
   disabled for that site and its subdomains, including pop-ups.
2. Or switch Shield off with the master toggle. That takes effect for new
   requests straight away.
3. **Test a request** in Shield settings shows which rule, if any, would block
   a given URL. It helps when writing an `@@` exception in **My filters**.

## Privacy

Shield runs entirely on your computer. It downloads the lists you enable from
their publishers and sends nothing else anywhere. Your allowlist, custom rules
and settings are saved in Vyro's local SQLite database.
