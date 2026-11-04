# ==========================================
# Startup logging without external media hosting
# ==========================================

import requests
from TEAMZYRO import TOKEN

CHAT_ID = -100
OWNER_NAME = "@sukuna_dev"


def send_start_message():
    """Send a plain-text startup notice; no Catbox/ImgBB URL is used."""
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    text = (
        "🤖 Bot has started successfully!\n\n"
        f"🧑‍💻 Owner: {OWNER_NAME}\n\n"
        "🚀 Status: All systems are operational!"
    )
    response = None
    try:
        response = requests.post(
            url,
            json={"chat_id": CHAT_ID, "text": text},
            timeout=20,
        )
        response.raise_for_status()
        print("Start message sent successfully.")
    except requests.exceptions.RequestException as exc:
        if response is not None:
            print(f"Error response: {response.text}")
        print(f"Failed to send start message: {exc}")
