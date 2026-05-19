import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { addReview, getReviews } from '@/lib/reputation';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  if (!address) {
    return NextResponse.json(
      { success: false, error: 'Missing required query param: address' },
      { status: 400, headers: CORS },
    );
  }
  const reviews = await getReviews(address);
  return NextResponse.json({ success: true, address, reviews }, { headers: CORS });
}

export async function POST(request) {
  try {
    const { escrowId, fromAddress, toAddress, score, comment } = await request.json();

    if (!escrowId || !fromAddress || !toAddress || score == null) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: escrowId, fromAddress, toAddress, score' },
        { status: 400, headers: CORS },
      );
    }
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return NextResponse.json(
        { success: false, error: 'score must be an integer between 1 and 5' },
        { status: 400, headers: CORS },
      );
    }
    if (fromAddress.toLowerCase() === toAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Cannot review yourself' },
        { status: 400, headers: CORS },
      );
    }
    if (comment && comment.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Comment must be 200 characters or fewer' },
        { status: 400, headers: CORS },
      );
    }

    const escrow = await storage.getById(escrowId);
    if (!escrow) {
      return NextResponse.json({ success: false, error: 'Escrow not found' }, { status: 404, headers: CORS });
    }
    if (escrow.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Can only review completed escrows' },
        { status: 400, headers: CORS },
      );
    }

    const isBuyer  = escrow.buyer.address.toLowerCase()  === fromAddress.toLowerCase();
    const isSeller = escrow.seller.address.toLowerCase() === fromAddress.toLowerCase();
    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { success: false, error: 'Only escrow parties can leave reviews' },
        { status: 403, headers: CORS },
      );
    }

    const expectedTo = isBuyer ? escrow.seller.address : escrow.buyer.address;
    if (toAddress.toLowerCase() !== expectedTo.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'toAddress must be the other party in this escrow' },
        { status: 400, headers: CORS },
      );
    }

    // Loser of a dispute cannot leave a review
    const winner  = escrow.releaseTx?.winner;
    const verdict = escrow.releaseTx?.verdict;
    if (winner && verdict && verdict !== 'SPLIT_50_50' && fromAddress.toLowerCase() !== winner.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'The losing party in a dispute cannot leave a review' },
        { status: 403, headers: CORS },
      );
    }

    // One review per escrow per reviewer
    const existing = await getReviews(toAddress);
    if (existing.some(r => r.escrowId === escrowId && r.fromAddress === fromAddress.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: 'You have already reviewed this party for this escrow' },
        { status: 409, headers: CORS },
      );
    }

    const review = {
      escrowId,
      fromAddress: fromAddress.toLowerCase(),
      toAddress:   toAddress.toLowerCase(),
      score,
      comment:     comment?.trim() ?? '',
      createdAt:   new Date().toISOString(),
    };
    await addReview(toAddress, review);

    return NextResponse.json({ success: true, review }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS });
  }
}
