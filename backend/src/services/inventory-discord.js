const BRAND_NAME = "YUGO MAFIA";
const WEBHOOK_NAME = "YUGO MAFIA Inventory";
const EMBED_COLOR = 0x1d4ed8;

function buildDiscordTimestamp(value, style = "F") {
  const date = new Date(value);
  const seconds = Math.floor(date.getTime() / 1000);

  if (!Number.isFinite(seconds)) {
    return "Not set";
  }

  return `<t:${seconds}:${style}>`;
}

function formatMelbourneTime(value) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

async function executeWebhook(payload) {
  const webhookUrl = process.env.INVENTORY_DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      posted: false,
      message: "Inventory Discord webhook is not configured."
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        posted: false,
        message: `Discord rejected the inventory update (${response.status}). ${text || "No extra details returned."}`
      };
    }

    return {
      posted: true
    };
  } catch (error) {
    return {
      posted: false,
      message: error.message || "Inventory Discord webhook request failed."
    };
  }
}

export async function postInventoryUpdateToDiscord(snapshot = {}) {
  const sentAt = snapshot.sentAt || new Date().toISOString();
  const payload = {
    username: WEBHOOK_NAME,
    content: [
      `# \uD83D\uDCE6 ${BRAND_NAME} STOCK UPDATE`,
      `> Website updated as of ${buildDiscordTimestamp(sentAt, "F")} (${buildDiscordTimestamp(sentAt, "R")})`
    ].join("\n"),
    embeds: [
      {
        title: "Stock take submitted",
        description: "The website inventory has been refreshed and is now up to date.",
        color: EMBED_COLOR,
        fields: [
          {
            name: "Melbourne Time",
            value: formatMelbourneTime(sentAt),
            inline: true
          },
          {
            name: "Items Tracked",
            value: new Intl.NumberFormat("en-AU").format(Number(snapshot.itemCount || 0)),
            inline: true
          },
          {
            name: "Units On Hand",
            value: new Intl.NumberFormat("en-AU").format(Number(snapshot.unitsOnHand || 0)),
            inline: true
          }
        ],
        footer: {
          text: "YUGO MAFIA Inventory"
        },
        timestamp: new Date(sentAt).toISOString()
      }
    ],
    allowed_mentions: {
      parse: []
    }
  };

  return executeWebhook(payload);
}
