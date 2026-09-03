# Legionnaire Insights

Tampermonkey userscript for [legionnaire.xyz](https://www.legionnaire.xyz/). It exposes hidden career data, adds seed search and keeps game progress synchronized across devices.

## Install

Open the [raw userscript](https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js) on each device and confirm installation in Tampermonkey.

On first use, press **Sync Now** and provide a GitHub fine-grained token with **Gists: Read and write**. Auto-sync is enabled by default and runs on startup, tab resume, local progress and every three minutes while visible.

Tampermonkey checks the repository URL for higher `@version` values, so later releases update without reinstalling the file manually.

## Storage and privacy

- This public repository contains code only.
- Game data is stored in the configured secret Gist.
- The GitHub token is kept in Tampermonkey's private userscript storage, not the game's `localStorage`.

See [docs/PROJECT.md](docs/PROJECT.md) for the compact technical handoff and [CHANGELOG.md](CHANGELOG.md) for release history.
