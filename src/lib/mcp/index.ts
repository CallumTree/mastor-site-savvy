import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import listSiteWalks from "./tools/list-site-walks";
import listProcurement from "./tools/list-procurement";
import listVariations from "./tools/list-variations";
import listValuations from "./tools/list-valuations";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mastor-mcp",
  title: "Mastor",
  version: "0.1.0",
  instructions:
    "Read-only access to Mastor construction project data for the signed-in user: projects, site walks, procurement items, variations, and payment valuations. All tools require a project UUID (except list_projects) and act as the authenticated user under RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjects, listSiteWalks, listProcurement, listVariations, listValuations],
});
