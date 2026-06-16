## Problem

`ProjectDocumentsTab.tsx` extracts text from PDFs using `pdfjs-dist`. It sets `GlobalWorkerOptions.workerSrc = ""` and passes `disableWorker: true`, but in current pdfjs-dist builds the `workerSrc` getter throws `No "GlobalWorkerOptions.workerSrc" specified` before `disableWorker` is honored — which is exactly the runtime error showing in the console.

## Fix

In `src/components/project/ProjectDocumentsTab.tsx` (lines 861–866), import the worker as a Vite asset URL and assign it to `GlobalWorkerOptions.workerSrc` instead of `""`:

```ts
if (e === "pdf") {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = pdfjs.getDocument({ data: buf, isEvalSupported: false });
  // ...rest unchanged
}
```

Also add `declare module "pdfjs-dist/build/pdf.worker.mjs?url";` to `src/types/document-parsers.d.ts` so the `?url` import typechecks.

This lets Vite bundle the worker, gives `workerSrc` a valid URL, and runs PDF parsing in a real worker (faster and avoids main-thread eval restrictions).

## Files

- `src/components/project/ProjectDocumentsTab.tsx` — replace the 5-line PDF branch
- `src/types/document-parsers.d.ts` — add one `declare module` line