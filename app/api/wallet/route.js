import { NextResponse } from 'next/server';
import { getWalletInfo } from '@/lib/circle';

export async function GET() {
  try {
    const info = await getWalletInfo();
    return NextResponse.json({ success: true, ...info });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      address: process.env.CIRCLE_ESCROW_ADDRESS || '',
      balance: '0.00',
    });
  }
}
