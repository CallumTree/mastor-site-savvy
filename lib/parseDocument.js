export async function parseBoQ(documentText, projectId) {

  const systemPrompt = `
You are a construction document parser for a UK building contractor platform.

Your job is to extract every single line item from the document provided.
You must not skip, summarise or combine any items.
Every row in the document becomes one object in your output.

Rules:
- Extract ALL items regardless of trade, location or type
- Preserve the exact description as written in the document
- Capture the comments field if present
- Capture code, quantity, unit, rate and cost exactly as written
- Group items under their location heading
- If no location heading exists use "General"
- Return ONLY valid JSON. No explanation. No markdown. No preamble.

Return this exact structure:
{
  "contract_reference": "string",
  "project_title": "string", 
  "property_address": "string",
  "contract_value": number,
  "items": [
    {
      "location": "string",
      "description": "string",
      "comments": "string or null",
      "code": "string or null",
      "quantity": number,
      "unit": "string or null",
      "rate": number,
      "cost": number,
      "element_type": "claimable_element"
    }
  ]
}
`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Parse every line item from this document:\n\n${documentText}`
        }
      ],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    console.error("Parse failed:", err);
    return null;
  }
}


export async function saveToSupabase(parsed, projectId, documentId, supabase) {
  if (!parsed || !parsed.items) return;

  const rows = parsed.items.map(item => ({
    project_id: projectId,
    document_id: documentId,
    element_type: "claimable_element",
    title: item.description,
    description: item.comments || null,
    quantity: item.quantity,
    unit: item.unit || null,
    unit_rate: item.rate,
    total_cost: item.cost,
    source_reference: item.code || null,
    location: item.location,
    confidence: 1.0
  }));

  const { error } = await supabase
    .from("scope_elements")
    .insert(rows);

  if (error) console.error("Supabase insert error:", error);
}
