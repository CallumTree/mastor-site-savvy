Change `max_tokens: 8000` to `max_tokens: 16000` in the Anthropic API call inside `src/lib/parseDocument.functions.ts`.

This gives the model more room to return all line items from large BoQ documents (50+ items) without truncating the JSON response mid-way.

Files affected:
- src/lib/parseDocument.functions.ts (1-line edit)