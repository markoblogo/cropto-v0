# Sea Brokerage Telegram Partner Handoff

Use this as the exact packet you send to partner ops when preparing monitor relay.

## 1) Bot details to share

- Bot username: `@spikemoonbot`
- Bot display name: `Spike Monitor`
- Purpose: receive BID/OFFER events from Sea Brokerage Monitor and publish to configured chats.

## 2) Partner-side actions (internal chat first)

1. Add `@spikemoonbot` to the internal company chat.
2. Grant permission to post messages.
3. Send one message in chat after adding the bot (helps verify chat visibility).
4. Provide the chat id to us (preferred numeric id, e.g. `-100...`).

## 3) Optional second stage (external/group relay)

1. Add same bot to external group.
2. Grant permission to post messages.
3. Provide external group chat id.
4. We enable external relay flag after internal flow is stable.

## 4) What we configure on our side

- `TELEGRAM_BOT_TOKEN`
- `SEA_BROKERAGE_TELEGRAM_INTERNAL_ENABLED=true`
- `SEA_BROKERAGE_TELEGRAM_INTERNAL_CHAT_ID=<partner_internal_chat_id>`
- `SEA_BROKERAGE_TELEGRAM_EXTERNAL_ENABLED=false` (until explicitly enabled)

When external is ready:

- `SEA_BROKERAGE_TELEGRAM_EXTERNAL_ENABLED=true`
- `SEA_BROKERAGE_TELEGRAM_EXTERNAL_CHAT_ID=<partner_external_group_id>`

## 5) Smoke checks

Internal:

```bash
npm run sea-brokerage:telegram:smoke -- --channel internal --chat-id -100XXXXXXXXXX
```

External:

```bash
npm run sea-brokerage:telegram:smoke -- --channel external --chat-id -100YYYYYYYYYY
```

## 6) Broker allowlist inputs (requested from partner)

For each broker:

- Telegram user id (preferred)
- Telegram username (`@handle`)
- Broker code
- Broker display name
- Company name

These identities are used to authorize BID/OFFER creation and attach broker signature in internal relay.

## 7) Suggested message to partner (copy/paste)

```
Please add @spikemoonbot (Spike Monitor) to your internal brokerage chat with permission to post messages.
After adding, send us:
1) internal chat ID
2) list of broker Telegram accounts for allowlist (telegram user id + @username + broker code/name/company)

Once internal relay is verified, we can enable external/group relay with anonymous broker output.
```

