import { logger } from "./logger";

/**
 * Push a lead to Attio CRM when a user submits an audit with an email.
 * Uses the Attio "assert" (upsert) endpoint so duplicate emails update
 * the existing record rather than creating duplicates.
 *
 * Fire-and-forget: never throws, never blocks the audit response.
 * Uses 1 subrequest (the fetch to api.attio.com).
 */
export async function pushLeadToAttio(
  email: string,
  brandName: string,
  brandUrl: string,
  tier: string,
  score: number,
  auditId: number
): Promise<void> {
  const apiKey = process.env.ATTIO_API_KEY;
  if (!apiKey) {
    logger.warn("attio_skip", { reason: "ATTIO_API_KEY not configured" });
    return;
  }

  const description = `Lead from AI Share of Voice (aishareofvoice.sashimilbz.workers.dev) — ${tier} tier audit for ${brandName} (${brandUrl}) — Score: ${score}/100 — Audit #${auditId}`;

  const body = {
    data: {
      values: {
        email_addresses: [email],
        description,
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(
      "https://api.attio.com/v2/objects/people/records?matching_attribute=email_addresses",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (resp.ok) {
      const data: any = await resp.json();
      logger.info("attio_push_ok", {
        email,
        recordId: data?.data?.id?.record_id,
        auditId,
      });
    } else {
      const errText = await resp.text().catch(() => "");
      logger.error("attio_push_fail", {
        email,
        status: resp.status,
        error: errText.slice(0, 200),
      });
    }
  } catch (err: any) {
    logger.error("attio_push_error", {
      email,
      error: err.name === "AbortError" ? "timeout (5s)" : err.message,
    });
  } finally {
    clearTimeout(timeout);
  }
}
