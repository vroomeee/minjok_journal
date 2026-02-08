import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type CleanupIssuesResult = {
  deletedIssues: string[];
  deletedVolumes: string[];
};

export async function cleanupIssuesAndVolumes(
  client: SupabaseClient<Database>,
  issueIds: string[],
  options?: { force?: boolean },
): Promise<CleanupIssuesResult> {
  if (!issueIds.length) {
    return { deletedIssues: [], deletedVolumes: [] };
  }

  const { data: remainingRows } = await client
    .from("issue_articles")
    .select("issue_id")
    .in("issue_id", issueIds);
  const remainingSet = new Set(
    remainingRows?.map((row) => row.issue_id).filter(Boolean) ?? [],
  );

  const toDeleteIssues = options?.force
    ? issueIds
    : issueIds.filter((id) => !remainingSet.has(id));

  if (!toDeleteIssues.length) return { deletedIssues: [], deletedVolumes: [] };

  await client.from("issue_articles").delete().in("issue_id", toDeleteIssues);

  const { data: volumeRows } = await client
    .from("volume_issues")
    .select("volume_id")
    .in("issue_id", toDeleteIssues);
  const volumeIds = Array.from(
    new Set(
      volumeRows?.map((row) => row.volume_id).filter(Boolean) ?? [],
    ),
  );

  await client.from("volume_issues").delete().in("issue_id", toDeleteIssues);
  await client.from("issues").delete().in("id", toDeleteIssues);

  const deletedVolumes: string[] = [];
  for (const volumeId of volumeIds) {
    const { count } = await client
      .from("volume_issues")
      .select("issue_id", { count: "exact", head: true })
      .eq("volume_id", volumeId);
    if ((count ?? 0) === 0) {
      await client.from("volumes").delete().eq("id", volumeId);
      deletedVolumes.push(volumeId);
    }
  }

  return { deletedIssues: toDeleteIssues, deletedVolumes };
}
