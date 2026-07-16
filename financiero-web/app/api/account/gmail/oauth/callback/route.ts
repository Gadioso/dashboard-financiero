import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      disabled: true,
      error: 'La conexión bancaria mediante Gmail fue retirada. Conecta tu banco desde Cuentas.',
    },
    { status: 410 }
  );
}
