// Returns the server's Unix timestamp in seconds. Clients use this to
// compute EIP-712 permit deadlines that are anchored to server time rather
// than potentially-drifted browser clocks — prevents "deadline in the past"
// reverts caused by clock skew between the user's machine and the chain.
export async function GET(): Promise<Response> {
  return Response.json(
    { unix: Math.floor(Date.now() / 1000) },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}
