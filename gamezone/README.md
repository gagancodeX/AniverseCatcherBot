# ✦ LUNA GAMEZONE

A mobile-first Telegram Mini App with six original canvas arcade games:

- **Flappy Luna** — one-touch flight through moon gates.
- **Luna Run** — three-lane endless runner with swipe, jump and slide controls.
- **Sky Jumper** — endless vertical platform jumper.
- **Star Defender** — guide a small starship and protect your shield.
- **Neon Breaker** — paddle-and-ball block breaker.
- **Neon Racer** — three-lane arcade racer.

The lobby art is a set of original hand-authored SVG illustrations. In-game environments, characters, gates, traffic, collectibles and effects are rendered with custom Canvas drawing code; the build uses no generated image packs or third-party game sprites. No Subway Surfers, Flappy Bird, or other third-party game assets are included. Personal bests and play counts are stored locally on the player's device in this first release.

## Host the Mini App

Deploy this directory as a **Render Static Site** (publish directory: `gamezone`, no build command). The site must use HTTPS.

Then add the resulting public URL to the existing bot service as:

```env
GAMEZONE_URL=https://your-static-site.onrender.com
```

Restart/redeploy the bot service after setting the variable. Inline launcher usage:

```
@LunaWaifuBot games
```

The bot displays the official inline Mini App button above the result list. Telegram's inline Mini App launch mode is designed to work from inline mode in chats and groups.

## Telegram notes

- Enable inline mode for the bot in @BotFather if it is not already enabled.
- No separate Telegram HTML5 Game registration is required; this uses the Mini App inline-results button.
- Scores are currently local to each device. A shared MongoDB leaderboard can be added separately with a server-side score endpoint and validation of Telegram init data.
