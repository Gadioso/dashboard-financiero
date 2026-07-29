# Virafi Content Operating System

## Objective

Earn attention with entertaining, interactive personal-finance content for Spanish-speaking audiences. Virafi may appear naturally inside a story, but the content must not feel like advertising.

Primary signals:

1. Three-second hold rate.
2. Average watch time and completion rate.
3. Replays.
4. Shares and sends.
5. Comments, saves, profile visits, and branded search.

## Weekly programming

Publish one vertical video from Monday through Friday. The default sustainable mix is:

| Day | Format | Purpose | Typical Opus credits |
| --- | --- | --- | ---: |
| Monday | Animated financial story | Reach and recognition | 25–30 |
| Tuesday | Real Virafi UI story | Demonstrate without selling | 0–2 |
| Wednesday | Interactive tip or motion graphic | Comments and saves | 8 |
| Thursday | Real UI challenge or native edit | Trust and curiosity | 0–2 |
| Friday | Animated humor or relatable money moment | Shares and replays | 25–30 |

Weekly operating ceiling: 75 estimated Opus credits. If no verified UI capture exists, replace the UI episode with a native edit or motion graphic; never invent a product screen.

## Content rules

- Use a visible hook in the first second, escalating movement, an interaction prompt, and a loop ending.
- At least three of five videos must be entertainment-led or interactive.
- Avoid sales calls to action, pricing, urgency, and direct conversion language.
- Do not promise returns, savings, approval, wealth, or guaranteed outcomes.
- Do not invent Virafi features, screens, metrics, customers, testimonials, or results.
- Use a short educational disclaimer when a video could be interpreted as personalized financial advice.
- Capture real interfaces from a safe demo account with fictional, non-sensitive data.

## Automated workflow

Flujo editorial: proceso determinístico ejecutado desde la aplicación y programado por Supabase cuando se active.

Input:

- Monday date (`weekOf`).
- Optional weekly theme.
- Audience.
- Available product moments.
- Verified UI asset references.
- Whether official social accounts are connected.

The workflow:

1. Generates five structured production briefs.
2. Checks weekday coverage, entertainment ratio, risky claims, sales language, UI evidence, and estimated Opus credits.
3. Routes each brief to Agent Opus web, OpusClip MCP, or manual UI capture.
4. Suspends for human approval.
5. After approval, releases production items while keeping publishing blocked if official accounts are unavailable.

Opus OAuth credentials remain managed by Codex. They are not copied into the application or committed to source control.

## Production and publishing gates

No item may move to production unless:

- the deterministic quality review passes; and
- a human approves the weekly package.

No item may be published unless:

- the official Virafi Instagram, TikTok, and Facebook accounts are connected;
- the final render has been visually reviewed;
- the caption and destination are confirmed; and
- explicit publishing approval has been given.

## Social account handoff checklist

When the official accounts are ready, provide:

- Instagram handle and confirmation that it is a professional account connected to a Facebook Page;
- TikTok handle and account type;
- Facebook Page name;
- target timezone and preferred posting windows;
- confirmation that OpusClip may publish to those specific destinations.

Do not reuse any previously connected personal account for Virafi publishing.

## Learning loop

Review performance weekly. Keep winning hooks and story structures, not merely winning topics. Retire formats after enough impressions show weak retention. Use comments as prompts for future episodes and change one major variable at a time so results remain interpretable.
