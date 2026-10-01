# Security Policy

## Supported versions

ToolQuiver is pre-1.0. Security fixes are applied to the latest release only.

| Version | Supported |
|---|---|
| latest release | Yes |
| older releases | No |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email the maintainer privately (see the repo owner's GitHub profile) with:

1. What the vulnerability is and where it lives
2. Steps to reproduce, if you have them
3. What you think the impact is

You can expect an acknowledgment within 72 hours and a fix or mitigation plan
as soon as one is verified. Please give us a reasonable window before public
disclosure.

## Scope notes

- ToolQuiver is a **local-first desktop app**: your library is a SQLite database
  on your machine. There is no server component, no user accounts, and no
  telemetry to attack.
- Analysis **does fetch public metadata** from sites you link (GitHub API,
  website meta tags). The app never sends your library contents anywhere.
- The GitHub token setting is optional and stored in your local app data only;
  it is sent solely to `api.github.com` to raise rate limits.
- Downloads of remote APKs and cover images are written to your local app data
  directory. Do not analyze links you don't trust — a malicious page's metadata
  is treated as display text only and never executed.
