# Google OAuth Verification

Dashboard Financiero needs Google verification before Gmail API access can work for many external users.

## Why

The Gmail bank integration requests:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Google treats Gmail access as sensitive or restricted user data. While the OAuth app is in testing, only test users can grant access. For a SaaS product, the app must be published and reviewed, or the product must avoid Gmail API access.

## Current Public Pages

Production pages added for review:

- Privacy policy: `https://dashboard-financiero-chi.vercel.app/privacy`
- Terms: `https://dashboard-financiero-chi.vercel.app/terms`

Before submitting to Google, prefer a custom domain instead of the shared Vercel domain:

```text
https://app.<your-domain>
```

## Required Google Cloud Setup

1. Use a dedicated OAuth client for Gmail/Bank, separate from Supabase login.
2. Authorized JavaScript origin:

```text
https://dashboard-financiero-chi.vercel.app
```

3. Authorized redirect URI:

```text
https://dashboard-financiero-chi.vercel.app/api/account/gmail/oauth/callback
```

4. Data Access scope:

```text
https://www.googleapis.com/auth/gmail.readonly
```

5. Audience must move from testing toward production for external users.
6. Privacy policy and terms URLs must be provided in Google Auth Platform.
7. The authorized domain should be verified in Google Search Console.
8. Submit OAuth app verification from Google Auth Platform.

## Product Fallbacks

If Google verification is too slow for beta:

- Keep Gmail OAuth available only for internal/test users.
- Add a user-specific bank forwarding address once inbound email infrastructure exists.
- Keep manual capture and Telegram as the default onboarding path.
- Evaluate bank data aggregators or open banking providers for production-grade ingestion.
