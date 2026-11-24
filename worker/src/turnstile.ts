/**
 * Cloudflare Turnstile check when the chat starts. Without a configured secret (local
 * development) it lets requests through.
 */
export async function verifyTurnstile(secret: string | undefined, token: unknown, ip: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip && ip !== "local") form.append("remoteip", ip);
  try {
    const r = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const data = (await r.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
