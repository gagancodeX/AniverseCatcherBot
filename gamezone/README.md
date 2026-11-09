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


## Native Telegram inline game cards (optional)

To show all six titles as native Telegram game cards with Telegram's built-in **Play** buttons:

1. In the bot's @BotFather chat, run `/newgame` six times for this same bot.
2. Use these exact short names and game URLs:

| Game title | BotFather short name | Game URL |
| --- | --- | --- |
| Flappy Luna | `luna_flappy` | `https://luna-gamezone.onrender.com/?game=flappy` |
| Luna Run | `luna_run` | `https://luna-gamezone.onrender.com/?game=runner` |
| Sky Jumper | `luna_sky_jumper` | `https://luna-gamezone.onrender.com/?game=jumper` |
| Star Defender | `luna_star_defender` | `https://luna-gamezone.onrender.com/?game=space` |
| Neon Breaker | `luna_neon_breaker` | `https://luna-gamezone.onrender.com/?game=brick` |
| Neon Racer | `luna_neon_racer` | `https://luna-gamezone.onrender.com/?game=racer` |

3. After all six registrations are complete, set `LUNA_NATIVE_GAMES_ENABLED=true` in the bot service environment and redeploy the bot.
4. Type `@LunaWaifuBot games` in any chat. Telegram will show the six game cards. Selecting one inserts its Telegram game message; tapping **Play** opens that game in Telegram's in-app game view.

The HTML5 game page still needs HTTPS hosting so Telegram can load it, but players do not need to navigate to the public GameZone lobby or an external browser. Native game cards require the matching BotFather registrations first.
