import { NextResponse } from 'next/server';
import { uploadToPinata } from '@/lib/pinata';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES     = 10 * 1024 * 1024; // 10 MB

export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, error: 'Only JPEG, PNG, GIF, and WebP images are allowed' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'Image must be under 10 MB' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url    = await uploadToPinata(buffer, file.name, file.type);
    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error('[upload]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
