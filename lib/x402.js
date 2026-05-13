import { NextResponse } from 'next/server';
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  HTTPFacilitatorClient,
} from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm';

const FACILITATOR_URL     = 'https://facilitator.coinbase.com';
const NETWORK             = 'eip155:8453'; // Base mainnet
const AMOUNT              = '0.001';       // USDC per request
const FALLBACK_RECIPIENT  = '0x9BB9a98478949c6734f7Ca62066C587403b80584';

// ── Lazy singleton ─────────────────────────────────────────────────────────────
// Built once per server process; avoids repeated facilitator round-trips.

// null  = not yet attempted
// false = attempted and failed (facilitator unreachable)
// object = successfully initialized
let _httpServer  = null;
let _initAttempted = false;

async function getHttpServer() {
  if (_httpServer)    return _httpServer;
  if (_initAttempted) return null; // already failed — skip silently

  _initAttempted = true;
  try {
    const payTo      = process.env.PLATFORM_WALLET_ADDRESS || FALLBACK_RECIPIENT;
    const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
    const coreServer  = new x402ResourceServer(facilitator);

    // Register ExactEvmScheme for Base mainnet (chain ID 8453, CAIP-2: eip155:8453).
    // ExactEvmScheme.parsePrice('0.001', 'eip155:8453') resolves to 1000 USDC micro-units
    // using DEFAULT_STABLECOINS['eip155:8453'] (address 0x833589f…).
    coreServer.register(NETWORK, new ExactEvmScheme());

    const httpServer = new x402HTTPResourceServer(coreServer, {
      accepts: {
        scheme:  'exact',
        network: NETWORK,
        payTo,
        price:   AMOUNT,
      },
    });

    await httpServer.initialize();
    _httpServer = httpServer;
    return _httpServer;
  } catch (err) {
    console.warn('[x402] facilitator unreachable, payment enforcement disabled:', err.message);
    return null;
  }
}

// ── Request adapter ────────────────────────────────────────────────────────────
// Wraps a Next.js Request into the interface x402HTTPResourceServer expects.

function makeAdapter(request) {
  return {
    getMethod:       ()     => request.method,
    getHeader:       (name) => request.headers.get(name),
    getUrl:          ()     => request.url,
    getAcceptHeader: ()     => request.headers.get('accept') ?? '',
  };
}

// ── withX402 ───────────────────────────────────────────────────────────────────
// Wraps any Next.js App Router route handler with x402 payment enforcement.
// Agents must include a valid X-Payment-Signature header (0.001 USDC on Base)
// or they receive a 402 with payment requirements in the response body.
// Settlement is executed against the Coinbase facilitator after the handler runs.
//
// Set SKIP_X402=true in .env.local to bypass payment enforcement locally
// (facilitator.coinbase.com is not reachable from all dev environments).

export function withX402(handler) {
  return async function x402Handler(request, ctx) {
    if (process.env.SKIP_X402 === 'true') {
      console.warn('[x402] payment enforcement bypassed (SKIP_X402=true)');
      return handler(request, ctx);
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    const httpServer = await getHttpServer();
    if (!httpServer) {
      // Facilitator unreachable — bypass x402 rather than blocking the API entirely.
      console.warn('[x402] bypassing payment check (facilitator unavailable)');
      return handler(request, ctx);
    }

    // ── Verify payment ────────────────────────────────────────────────────────
    const url        = new URL(request.url);
    const adapter    = makeAdapter(request);
    const reqContext = { adapter, path: url.pathname, method: request.method };

    let result;
    try {
      result = await httpServer.processHTTPRequest(reqContext);
    } catch (err) {
      console.error('[x402] verify error:', err.message);
      return NextResponse.json(
        { success: false, error: 'Payment verification failed' },
        { status: 500 },
      );
    }

    // No valid payment header → return 402 with payment requirements
    if (result.type === 'payment-error') {
      const { response } = result;
      return NextResponse.json(response.body, {
        status:  response.status,
        headers: response.headers,
      });
    }

    // ── Run handler ───────────────────────────────────────────────────────────
    // Either payment-verified or no-payment-required (shouldn't happen with wildcard
    // route config, but handled defensively).
    const handlerResponse = await handler(request, ctx);

    // ── Settle ────────────────────────────────────────────────────────────────
    // Settle on-chain after a successful response. Failure here is non-fatal —
    // the client already received a valid response and the payment was pre-verified.
    if (result.type === 'payment-verified') {
      const { paymentPayload, paymentRequirements, declaredExtensions } = result;
      try {
        const settleResult = await httpServer.processSettlement(
          paymentPayload,
          paymentRequirements,
          declaredExtensions,
          { request: reqContext },
        );

        // Forward any settlement headers (e.g. X-Payment-Response) to the client
        if (settleResult?.headers && Object.keys(settleResult.headers).length > 0) {
          const headers = new Headers(handlerResponse.headers);
          for (const [k, v] of Object.entries(settleResult.headers)) {
            headers.set(k, v);
          }
          const body = await handlerResponse.arrayBuffer();
          return new Response(body, {
            status:     handlerResponse.status,
            statusText: handlerResponse.statusText,
            headers,
          });
        }
      } catch (err) {
        console.error('[x402] settlement failed:', err.message);
      }
    }

    return handlerResponse;
  };
}
