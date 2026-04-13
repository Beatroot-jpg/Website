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

function buildMeetingMessage(meeting, audienceLabel) {
  return [
    `**Meeting Scheduled**`,
    `**Title:** ${meeting.title}`,
    `**When:** ${new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(meeting.startsAt))}`,
    meeting.endsAt ? `**Ends:** ${new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(meeting.endsAt))}` : "",
    meeting.location ? `**Location:** ${meeting.location}` : "",
    audienceLabel ? `**Audience:** ${audienceLabel}` : "",
    meeting.details ? `**Details:** ${truncate(meeting.details, 900)}` : ""
  ].filter(Boolean).join("\n");
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

function buildRecordMessage(record, audienceLabel) {
  return [
    `**${humanizeRecordType(record.type)}**`,
    `**Title:** ${record.title}`,
    audienceLabel ? `**Audience:** ${audienceLabel}` : "",
    record.meeting?.title ? `**Meeting:** ${record.meeting.title}` : "",
    record.summary ? `**Summary:** ${truncate(record.summary, 500)}` : "",
    truncate(record.content, 1300)
  ].filter(Boolean).join("\n");
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
  const mention = buildMention(audience);
  const content = [mention, buildMeetingMessage(meeting, audience?.label && audience.key !== "NONE" ? audience.label : "")].filter(Boolean).join("\n\n");

  return executeWebhook({
    content,
    allowed_mentions: buildAllowedMentions(audience)
  });
}

export async function postRecordToDiscord(record) {
  const audience = getSecretaryAudienceByKey(record.audience);
  const mention = buildMention(audience);
  const content = [mention, buildRecordMessage(record, audience?.label && audience.key !== "NONE" ? audience.label : "")].filter(Boolean).join("\n\n");

  return executeWebhook({
    content,
    allowed_mentions: buildAllowedMentions(audience)
  });
}
