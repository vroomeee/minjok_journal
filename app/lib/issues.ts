import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { collectStorageObjectPaths } from "./storage";

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

  const { data: issueRows } = await client
    .from("issues")
    .select("id,cover_url")
    .in("id", toDeleteIssues);
  const issueCoverById = new Map(
    (issueRows ?? []).map((row) => [row.id, row.cover_url]),
  );

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
  const { data: deletedIssues } = await client
    .from("issues")
    .delete()
    .in("id", toDeleteIssues)
    .select("id");

  const deletedIssueCoverPaths = collectStorageObjectPaths(
    (deletedIssues ?? []).map((row) => issueCoverById.get(row.id) ?? null),
    "covers",
  );
  const deletedIssueIds = (deletedIssues ?? []).map((row) => row.id);

  const volumeCoverPaths: string[] = [];
  const deletedVolumes: string[] = [];
  for (const volumeId of volumeIds) {
    const { data: volumeRow } = await client
      .from("volumes")
      .select("cover_url")
      .eq("id", volumeId)
      .maybeSingle();

    const { count } = await client
      .from("volume_issues")
      .select("issue_id", { count: "exact", head: true })
      .eq("volume_id", volumeId);
    if ((count ?? 0) === 0) {
      const { data: deletedVolume } = await client
        .from("volumes")
        .delete()
        .eq("id", volumeId)
        .select("id")
        .maybeSingle();
      if (deletedVolume?.id) {
        deletedVolumes.push(volumeId);
        const coverPath = collectStorageObjectPaths(
          [volumeRow?.cover_url],
          "covers",
        );
        if (coverPath.length) {
          volumeCoverPaths.push(...coverPath);
        }
      }
    }
  }

  const coverPathsToRemove = Array.from(
    new Set([...deletedIssueCoverPaths, ...volumeCoverPaths]),
  );
  if (coverPathsToRemove.length > 0) {
    await client.storage.from("covers").remove(coverPathsToRemove);
  }

  return { deletedIssues: deletedIssueIds, deletedVolumes };
}
