/**
 * Notification deep-link builder.
 *
 * BASE: /w/:workspace_id/boards/:board_id?task=:task_id
 *
 * ANCHOR_PARAMS — query params appended when present in notification meta.
 * To support a new deep-link (e.g. approval_id, attachment_id), add its key here.
 */
const ANCHOR_PARAMS = ["comment_id", "approval_id", "attachment_id"];

/**
 * Build the navigation URL from a notification's meta object.
 * Returns null if the meta lacks the required base fields.
 *
 * @param {object} meta - The notification's meta object
 * @returns {string|null}
 */
export function notificationUrl(meta = {}) {
  const { workspace_id, board_id, task_id } = meta;
  if (!workspace_id || !board_id || !task_id) return null;

  const params = new URLSearchParams({ task: task_id });
  for (const key of ANCHOR_PARAMS) {
    if (meta[key]) params.set(key, meta[key]);
  }

  return `/w/${workspace_id}/boards/${board_id}?${params.toString()}`;
}
