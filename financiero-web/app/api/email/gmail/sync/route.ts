import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const retiredMessage = 'La sincronización bancaria por Gmail fue retirada. Usa la conexión bancaria read-only.';

function retiredResponse() {
  return NextResponse.json(
    { success: false, disabled: true, error: retiredMessage },
    { status: 410 }
  );
}

export async function GET() {
  return retiredResponse();
}

export async function POST() {
  return retiredResponse();
}
