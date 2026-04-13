const DEFAULT_AUDIENCES = [
  {
    key: "NONE",
    label: "No ping",
    roleId: ""
  },
  {
    key: "MANAGEMENT",
    label: "Management",
    roleId: "1455144843293626537"
  },
  {
    key: "FAMILY",
    label: "Family (Everyone)",
    roleId: "1453290647040688190"
  },
  {
    key: "SCIENTIST",
    label: "Scientist",
    roleId: "1461959781077225605"
  },
  {
    key: "STONE_MASONS",
    label: "Stone Masons",
    roleId: "1467674897496018986"
  }
];

const BRAND_NAME = "YUGO MAFIA";
const WEBHOOK_NAME = "YUGO MAFIA Secretary";
const IMAGE_URL_PATTERN = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/i;
const DISCORD_COLORS = {
  meeting: 0x1d4ed8,
  minutes: 0x15803d,
  journal: 0x64748b,
  notice: 0xf59e0b
};

function normalizeKey(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export function getSecretaryAudienceOptions() {
  const raw = process.env.SECRETARY_DISCORD_AUDIENCES;

  if (!raw) {
    return DEFAULT_AUDIENCES;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || !parsed.length) {
      return DEFAULT_AUDIENCES;
    }

    const normalized = parsed
      .map((entry) => ({
        key: normalizeKey(entry.key),
        label: `${entry.label || entry.key || ""}`.trim(),
        roleId: `${entry.roleId || ""}`.trim()
      }))
      .filter((entry) => entry.key && entry.label);

    if (!normalized.some((entry) => entry.key === "NONE")) {
      normalized.unshift({
        key: "NONE",
        label: "No ping",
        roleId: ""
      });
    }

    return normalized.length ? normalized : DEFAULT_AUDIENCES;
  } catch (_error) {
    return DEFAULT_AUDIENCES;
  }
}

export function getSecretaryAudienceByKey(audienceKey) {
  const normalized = normalizeKey(audienceKey);
  return getSecretaryAudienceOptions().find((entry) => entry.key === normalized) || null;
}

function truncate(value, maxLength = 1900) {
  const text = `${value || ""}`.trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function extractImageUrl(value) {
  const text = `${value || ""}`;
  const match = text.match(IMAGE_URL_PATTERN);
  return match?.[0] || "";
}

function stripImageUrls(value) {
  return `${value || ""}`.replace(new RegExp(IMAGE_URL_PATTERN, "gi"), "").replace(/\n{3,}/g, "\n\n").trim();
}

function buildDiscordTimestamp(value, style = "F") {
  const date = new Date(value);
  const seconds = Math.floor(date.getTime() / 1000);

  if (!Number.isFinite(seconds)) {
    return "Not set";
  }

  return `<t:${seconds}:${style}>`;
}

function formatZonedDate(value, timeZone) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function buildMention(audience) {
  if (!audience?.roleId) {
    return "";
  }

  return `<@&${audience.roleId}>`;
}

function buildAllowedMentions(audience) {
  if (!audience?.roleId) {
    return { parse: [] };
  }

  return {
    roles: [audience.roleId]
  };
}

function buildMeetingPayload(meeting, audience) {
  const mention = buildMention(audience);
  const content = [
    mention,
    `# 📅 ${BRAND_NAME} MEETING`,
    `## ${truncate(meeting.title, 180)}`,
    `> Local for you: ${buildDiscordTimestamp(meeting.startsAt, "F")} (${buildDiscordTimestamp(meeting.startsAt, "R")})`
  ].filter(Boolean).join("\n");
  const cleanedDetails = stripImageUrls(meeting.details);
  const imageUrl = extractImageUrl(meeting.details);
  const fields = [
    {
      name: "Melbourne Time",
      value: formatZonedDate(meeting.startsAt, "Australia/Melbourne"),
      inline: true
    },
    {
      name: "New Zealand Time",
      value: formatZonedDate(meeting.startsAt, "Pacific/Auckland"),
      inline: true
    },
    {
      name: "Audience",
      value: audience?.key && audience.key !== "NONE" ? audience.label : "No ping",
      inline: true
    }
  ];

  if (meeting.endsAt) {
    fields.push({
      name: "Meeting Ends",
      value: formatZonedDate(meeting.endsAt, "Australia/Melbourne"),
      inline: true
    });
  }

  if (meeting.location) {
    fields.push({
      name: "Location",
      value: truncate(meeting.location, 900),
      inline: true
    });
  }

  fields.push({
    name: "Status",
    value: `${meeting.status || "SCHEDULED"}`.replaceAll("_", " "),
    inline: true
  });

  return {
    username: WEBHOOK_NAME,
    content,
    embeds: [
      {
        title: truncate(meeting.title, 256),
        description: cleanedDetails
          ? truncate(cleanedDetails, 1800)
          : "Meeting scheduled through the YUGO MAFIA secretary workspace.",
        color: DISCORD_COLORS.meeting,
        fields,
        footer: {
          text: "YUGO MAFIA Secretary"
        },
        timestamp: new Date(meeting.startsAt).toISOString(),
        ...(imageUrl ? { image: { url: imageUrl } } : {})
      }
    ],
    allowed_mentions: buildAllowedMentions(audience)
  };
}

function humanizeRecordType(type) {
  const normalized = `${type || ""}`.toUpperCase();

  if (normalized === "MEETING_MINUTES") {
    return "Meeting Minutes";
  }

  if (normalized === "JOURNAL_ENTRY") {
    return "Journal Entry";
  }

  return "Notice";
}

function recordStyle(type) {
  const normalized = `${type || ""}`.toUpperCase();

  if (normalized === "MEETING_MINUTES") {
    return {
      emoji: "📝",
      heading: "MINUTES",
      color: DISCORD_COLORS.minutes
    };
  }

  if (normalized === "JOURNAL_ENTRY") {
    return {
      emoji: "📓",
      heading: "JOURNAL ENTRY",
      color: DISCORD_COLORS.journal
    };
  }

  return {
    emoji: "📢",
    heading: "NOTICE",
    color: DISCORD_COLORS.notice
  };
}

function buildRecordPayload(record, audience) {
  const style = recordStyle(record.type);
  const mention = buildMention(audience);
  const cleanedSummary = stripImageUrls(record.summary);
  const cleanedContent = stripImageUrls(record.content);
  const imageUrl = extractImageUrl(`${record.summary || ""}\n${record.content || ""}`);
  const content = [
    mention,
    `# ${style.emoji} ${BRAND_NAME} ${style.heading}`,
    `## ${truncate(record.title, 180)}`,
    record.meeting?.title ? `> Linked meeting: ${truncate(record.meeting.title, 180)}` : ""
  ].filter(Boolean).join("\n");
  const descriptionParts = [
    cleanedSummary ? `> ${truncate(cleanedSummary, 500)}` : "",
    cleanedContent ? truncate(cleanedContent, 1800) : ""
  ].filter(Boolean);
  const fields = [
    {
      name: "Audience",
      value: audience?.key && audience.key !== "NONE" ? audience.label : "No ping",
      inline: true
    },
    {
      name: "Type",
      value: humanizeRecordType(record.type),
      inline: true
    }
  ];

  if (record.meeting?.title) {
    fields.push({
      name: "Meeting",
      value: truncate(record.meeting.title, 900),
      inline: true
    });
  }

  return {
    username: WEBHOOK_NAME,
    content,
    embeds: [
      {
        title: truncate(record.title, 256),
        description: descriptionParts.join("\n\n") || "Organization record posted from the YUGO MAFIA secretary workspace.",
        color: style.color,
        fields,
        footer: {
          text: "YUGO MAFIA Secretary"
        },
        timestamp: new Date(record.updatedAt || record.createdAt || Date.now()).toISOString(),
        ...(imageUrl ? { image: { url: imageUrl } } : {})
      }
    ],
    allowed_mentions: buildAllowedMentions(audience)
  };
}

async function executeWebhook(payload) {
  const webhookUrl = process.env.SECRETARY_DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      posted: false,
      message: "Discord webhook is not configured."
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
        message: `Discord rejected the message (${response.status}). ${text || "No extra details returned."}`
      };
    }

    return {
      posted: true
    };
  } catch (error) {
    return {
      posted: false,
      message: error.message || "Discord webhook request failed."
    };
  }
}

export async function postMeetingToDiscord(meeting) {
  const audience = getSecretaryAudienceByKey(meeting.audience);
  return executeWebhook(buildMeetingPayload(meeting, audience));
}

export async function postRecordToDiscord(record) {
  const audience = getSecretaryAudienceByKey(record.audience);
  return executeWebhook(buildRecordPayload(record, audience));
}
