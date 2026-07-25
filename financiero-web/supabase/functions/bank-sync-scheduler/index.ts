// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- Supabase Edge Functions execute in Deno, outside the Next.js runtime.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const appUrl = 'https://virafi.com';

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sign(secret: string, timestamp: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp)));
}

Deno.serve(async (request: Request) => {
  if (!['GET', 'POST'].includes(request.method)) {
    return Response.json({ success: false, error: 'Método no permitido.' }, { status: 405 });
  }

  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const receivedSchedulerSecret = (request.headers.get('x-bank-scheduler-secret') || '').trim();
  if (!serviceRoleKey || !supabaseUrl) {
    return Response.json({ success: false, error: 'Scheduler no configurado.' }, { status: 500 });
  }

  const secretResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_bank_sync_scheduler_secret`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const expectedSchedulerSecret = secretResponse.ok ? String(await secretResponse.json()).trim() : '';
  let difference = expectedSchedulerSecret.length ^ receivedSchedulerSecret.length;
  for (let index = 0; index < Math.max(expectedSchedulerSecret.length, receivedSchedulerSecret.length); index += 1) {
    difference |= (expectedSchedulerSecret.charCodeAt(index) || 0) ^ (receivedSchedulerSecret.charCodeAt(index) || 0);
  }
  if (!expectedSchedulerSecret || difference !== 0) {
    console.error('Scheduler auth rejected', {
      secretRpcStatus: secretResponse.status,
      expectedLength: expectedSchedulerSecret.length,
      receivedLength: receivedSchedulerSecret.length,
    });
    return Response.json({
      success: false,
      error: 'No autorizado.',
      diagnostic: {
        secretRpcStatus: secretResponse.status,
        expectedLength: expectedSchedulerSecret.length,
        receivedLength: receivedSchedulerSecret.length,
      },
    }, { status: 401 });
  }

  const timestamp = String(Date.now());
  const signature = await sign(expectedSchedulerSecret, timestamp);
  try {
    const response = await fetch(`${appUrl}/api/bank/syncfy/auto-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${expectedSchedulerSecret}`,
        'Content-Type': 'application/json',
        'x-bank-sync-timestamp': timestamp,
        'x-bank-sync-signature': signature,
      },
      body: '{}',
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
    });
  } catch (error: unknown) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'No pude invocar la sincronización bancaria.',
    }, { status: 502 });
  }
});
