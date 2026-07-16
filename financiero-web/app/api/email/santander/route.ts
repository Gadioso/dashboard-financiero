import { NextResponse } from 'next/server';

const retiredMessage = 'La ingesta Santander por correo fue retirada. Usa conexión bancaria, Telegram o web.';

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
