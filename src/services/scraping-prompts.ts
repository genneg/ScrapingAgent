const BASE_OUTPUT_TEMPLATE = `{
  "name": "Festival name",
  "description": "Exactly 120 words describing the festival",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "timezone": "IANA timezone or null",
  "registrationDeadline": "YYYY-MM-DD or null",
  "venue": {
    "name": "Primary venue name",
    "address": "Street address or null",
    "city": "City name",
    "state": "State or null",
    "country": "Country name",
    "postalCode": "Postal code or null",
    "latitude": 12.3456,
    "longitude": 12.3456
  },
  "imageUrl": "Main festival image or banner URL or null",
  "venues": [
    {
      "name": "Venue name",
      "address": "Street address or null",
      "city": "City name",
      "state": "State or null",
      "country": "Country name",
      "postalCode": "Postal code or null",
      "latitude": 12.3456,
      "longitude": 12.3456
    }
  ],
  "website": "Official website or null",
  "facebook": "Facebook URL or null",
  "instagram": "Instagram URL or null",
  "email": "Contact email or null",
  "phone": "Contact phone or null",
  "registrationUrl": "Registration URL or null",
  "teachers": [
    {
      "name": "Teacher full name",
      "bio": "Biography text if clearly present in provided content; omit this field or set null if not present",
      "specializations": ["swing", "blues"],
      "website": "Teacher's official website or null",
      "imageUrl": "URL to teacher's photo or null"
    }
  ],
  "musicians": [
    {
      "name": "Band or musician",
      "bio": "Biography text if clearly present in provided content; omit this field or set null if not present",
      "genre": ["swing", "blues", "jazz"],
      "website": "Musician's or band's official website or null",
      "imageUrl": "URL to musician's or band's photo or null"
    }
  ],
  "prices": [
    {
      "type": "early_bird|regular|late|student|local|vip|donation",
      "amount": 150.0,
      "currency": "USD|EUR|GBP|CHF",
      "deadline": "YYYY-MM-DD or null",
      "description": "Extra details or null"
    }
  ],
  "tags": ["swing", "blues"],
  "confidence": 0.95
}`;

const CORE_INSTRUCTIONS = `
Return ONLY valid JSON (no code fences, no commentary).
If a teacher or musician biography is not clearly present in the provided website content, omit the bio field for that person or set it to null. Do NOT fabricate, infer, or research bios externally.
STYLE: Use the voice of an elegant 1940s–60s presenter, conveying love for music and dance, refined and warm, but strictly factual.
Field requirements:
- All dates must be ISO format YYYY-MM-DD.
- Strings must be plain text in English (no HTML).
- Arrays should exist (empty when needed).
- Missing optional data must be null or omitted.
- Festival description must be exactly 120 words.
`;

export function buildPrimaryPrompt(content: string, sourceUrl: string): string {
  return `You are an expert data analyst for SwingRadar.
Extract every reliable detail about the swing/blues festival at ${sourceUrl}.

${CORE_INSTRUCTIONS}

BIO POLICY:
- Include teacher/musician bios ONLY if present in the provided website content; otherwise omit or set null.
- Never invent or embellish biographies.

CONTENT STRUCTURE:
- The content has been preprocessed to preserve readable structure with clear section markers
- Look for patterns like "=== MAIN TITLE: ===", "== SECTION: ==", "--- SUBSECTION: ---", "=== BIO SECTION ===", and "--- PERSON: ---"
- These markers indicate important content areas including biographical information
- "--- PERSON: ---" markers often introduce individual biographies

BIOGRAPHY EXTRACTION:
- Scan the entire content for any biographical information about teachers and musicians
- Look for paragraphs describing people's backgrounds, experience, or career details
- Pay special attention to sections that mention names followed by descriptive text
- If you find detailed descriptions of people, extract them as biographies
- Biographies can appear anywhere in the content - not just in dedicated bio sections
- IMPORTANT: Extract substantial biographies (50-2000 characters) when available - don't skip them due to length
- Include details about musical background, teaching experience, achievements, and performance history
- Preserve the original descriptive language and specific details found in the content

MULTI-PAGE CONTEXT:
- The content may include information from multiple pages explored during scraping
- Use all available information across the entire content to build complete teacher/musician profiles

Website content:
"""
${content}
"""

Respond with JSON matching:
${BASE_OUTPUT_TEMPLATE}`;
}

export function buildRetryPrompt(
  content: string,
  sourceUrl: string,
  previousConfidence: number,
  threshold: number
): string {
  return `Previous extraction confidence: ${previousConfidence.toFixed(2)} (minimum required ${threshold}).
Re-run the extraction carefully, filling any missing data and verifying consistency.

Important:
- If teacher/musician bios are missing in the content, omit them (or set null). Do not fabricate.
- Look more carefully for biographical content - substantial bios (50-2000 characters) are valuable and should be extracted when present
- Maintain the elegant 1940s–60s presenter tone with sincere love for music and dance, while staying factual.

${buildPrimaryPrompt(content, sourceUrl)}`;
}

export function buildMinimalPrompt(sourceUrl: string): string {
  return `Provide ONLY this JSON for the festival at ${sourceUrl} and nothing else:
${BASE_OUTPUT_TEMPLATE}`;
}
