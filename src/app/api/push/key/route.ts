// The VAPID public key is, by definition, public. The service worker needs it
// after a subscription rotation, when the old options are unavailable.
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return Response.json({ error: "push is not configured" }, { status: 503 });
  return Response.json({ key });
}
