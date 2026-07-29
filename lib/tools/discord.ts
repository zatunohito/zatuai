export async function sendDiscordDm(message: string): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const ownerUserId = process.env.DISCORD_OWNER_USER_ID

  if (!botToken) {
    throw new Error('DISCORD_BOT_TOKEN environment variable is not set')
  }
  if (!ownerUserId) {
    throw new Error('DISCORD_OWNER_USER_ID environment variable is not set')
  }

  const authHeader = `Bot ${botToken}`
  const apiBase = 'https://discord.com/api/v10'

  const channelRes = await fetch(`${apiBase}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: ownerUserId }),
  })

  if (!channelRes.ok) {
    const text = await channelRes.text()
    throw new Error(
      `Failed to create DM channel: HTTP ${channelRes.status} ${channelRes.statusText} - ${text}`,
    )
  }

  const { id: channelId } = (await channelRes.json()) as { id: string }

  const messageRes = await fetch(
    `${apiBase}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: message }),
    },
  )

  if (!messageRes.ok) {
    const text = await messageRes.text()
    throw new Error(
      `Failed to send DM: HTTP ${messageRes.status} ${messageRes.statusText} - ${text}`,
    )
  }
}
