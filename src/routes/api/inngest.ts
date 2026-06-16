import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest, parseBoQJob } from "@/lib/parseBoQJob.server";

const handler = serve({ client: inngest, functions: [parseBoQJob] });

export const Route = createFileRoute("/api/inngest")({
  server: {
    handlers: {
      GET: async ({ request }) => handler(request),
      POST: async ({ request }) => handler(request),
      PUT: async ({ request }) => handler(request),
    },
  },
});
