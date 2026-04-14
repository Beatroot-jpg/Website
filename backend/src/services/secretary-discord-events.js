const DISCORD_API_BASE = "https://discord.com/api/v10";
const EXTERNAL_EVENT_TYPE = 3;
const GUILD_ONLY_PRIVACY_LEVEL = 2;
const DISCORD_CANCELED_STATUS = 4;

function truncate(value, maxLength) {
  const text = `${value || ""}`.trim();

  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function getDiscordEventConfig() {
  const token = `${process.env.SECRETARY_DISCORD_BOT_TOKEN || ""}`.trim();
  const guildId = `${process.env.SECRETARY_DISCORD_GUILD_ID || ""}`.trim();

  if (!token || !guildId) {
    return null;
  }

  return { token, guildId };
}

function buildHeaders(token, reason = "") {
  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  };

  if (reason) {
    headers["X-Audit-Log-Reason"] = reason;
  }

  return headers;
}

async function executeDiscordRequest(path, { method = "GET", token, body, reason = "" } = {}) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: buildHeaders(token, reason),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const message = data?.message || `Discord scheduled event request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function validateMeetingForExternalEvent(meeting) {
  if (!meeting.endsAt) {
    return "Discord RSVP events need an end time.";
  }

  if (!meeting.location) {
    return "Discord RSVP events need a location or VC link.";
  }

  return "";
}

function buildExternalEventPayload(meeting) {
  return {
    name: truncate(meeting.title, 100),
    description: truncate(meeting.details || "Scheduled from the YUGO MAFIA secretary workspace.", 1000),
    privacy_level: GUILD_ONLY_PRIVACY_LEVEL,
    scheduled_start_time: new Date(meeting.startsAt).toISOString(),
    scheduled_end_time: new Date(meeting.endsAt).toISOString(),
    entity_type: EXTERNAL_EVENT_TYPE,
    entity_metadata: {
      location: truncate(meeting.location, 100)
    }
  };
}

export function discordScheduledEventsEnabled() {
  return Boolean(getDiscordEventConfig());
}

export async function syncDiscordScheduledEvent(meeting) {
  const config = getDiscordEventConfig();

  if (!config) {
    return {
      synced: false,
      message: "Discord scheduled events are not configured."
    };
  }

  if (`${meeting.status || ""}`.toUpperCase() === "CANCELLED") {
    if (!meeting.discordEventId) {
      return {
        synced: false,
        message: "No Discord event exists yet for this meeting."
      };
    }

    const event = await executeDiscordRequest(
      `/guilds/${config.guildId}/scheduled-events/${meeting.discordEventId}`,
      {
        method: "PATCH",
        token: config.token,
        body: {
          status: DISCORD_CANCELED_STATUS
        },
        reason: `Cancel meeting ${truncate(meeting.title, 80)}`
      }
    );

    return {
      synced: true,
      eventId: event.id,
      status: event.status
    };
  }

  const validationMessage = validateMeetingForExternalEvent(meeting);

  if (validationMessage) {
    return {
      synced: false,
      message: validationMessage
    };
  }

  const payload = buildExternalEventPayload(meeting);
  const path = meeting.discordEventId
    ? `/guilds/${config.guildId}/scheduled-events/${meeting.discordEventId}`
    : `/guilds/${config.guildId}/scheduled-events`;
  const method = meeting.discordEventId ? "PATCH" : "POST";
  let event;

  try {
    event = await executeDiscordRequest(path, {
      method,
      token: config.token,
      body: payload,
      reason: `${meeting.discordEventId ? "Update" : "Create"} meeting ${truncate(meeting.title, 80)}`
    });
  } catch (error) {
    if (meeting.discordEventId && error.status === 404) {
      event = await executeDiscordRequest(`/guilds/${config.guildId}/scheduled-events`, {
        method: "POST",
        token: config.token,
        body: payload,
        reason: `Recreate meeting ${truncate(meeting.title, 80)}`
      });
    } else {
      throw error;
    }
  }

  return {
    synced: true,
    eventId: event.id,
    status: event.status
  };
}

export async function deleteDiscordScheduledEvent(meeting) {
  const config = getDiscordEventConfig();

  if (!config || !meeting.discordEventId) {
    return {
      synced: false,
      message: "No Discord event to remove."
    };
  }

  try {
    await executeDiscordRequest(
      `/guilds/${config.guildId}/scheduled-events/${meeting.discordEventId}`,
      {
        method: "DELETE",
        token: config.token,
        reason: `Delete meeting ${truncate(meeting.title, 80)}`
      }
    );
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  return {
    synced: true,
    deleted: true
  };
}
