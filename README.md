<h1 align="center">✦ LUNA CATCHER BOT ✦</h1>

<p align="center"><b>Catch · Collect · Trade · Play</b></p>
<p align="center">A Telegram-native anime character collection game with interactive group gameplay.</p>

<p align="center">
  <a href="https://github.com/gagancodeX/LunaCatcherBot">GitHub Repository</a>
  · Creator: <b>Adam</b>
</p>

---

## ✦ Features

- Anime character spawning, guessing and collection management.
- Character search, favourites, rarity filters and leaderboards.
- Character gifts, trades, transfers and redeem codes.
- Economy features, rewards and interactive mini-games.
- Telegram-based character media storage.
- MongoDB-backed user and character data.

## ✦ Setup

Use Python 3.11 or later.

```bash
git clone https://github.com/gagancodeX/LunaCatcherBot.git
cd LunaCatcherBot
python -m venv .venv
```

Activate the virtual environment, then install dependencies:

```bash
pip install -r requirements.txt
```

Create your environment file:

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

- `API_ID` and `API_HASH` — Telegram API credentials.
- `TOKEN` — Telegram bot token.
- `MONGO_URL` — MongoDB connection URI.
- `BOT_LOGGING` and `DATABASE_ID` — log and character storage chat IDs/usernames.
- `FORCE_JOIN` — required chat ID for the claim restriction.
- `FORCE_JOIN_LINK` — public Telegram link or invite link shown by `/hclaim`.
- `SUPPORT_CHAT`, `UPDATE_CHAT` and `OWNER_ID` — bot configuration.
- `DEVELOPER_LINK` — Telegram profile link shown by the `/start` Developer button.

`BACKUP_MONGO_URL`, `MUSJ_JOIN` and start media settings are optional. **A Pyrogram SESSION_STRING is not required.**

## ✦ Run

```bash
python -m LUNA
```

The project now runs from the `LUNA` Python package. Internal imports, startup commands and the Docker entry point all use this package name.

## ✦ Deployment

The repository includes a `Procfile` and `Dockerfile` for supported hosting workflows. Configure the environment variables on your hosting provider before starting the service.

## ✦ Project

- Repository: https://github.com/gagancodeX/LunaCatcherBot
- License: MIT
- Creator credit: Adam
