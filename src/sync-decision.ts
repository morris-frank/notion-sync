export type ExistingPageDirection = "push" | "pull" | "unchanged";

export function decideExistingPageDirection(input: {
  pending: boolean;
  localChanged: boolean;
  remoteChanged: boolean;
  localModifiedAt: string;
  remoteEditedAt: string;
}): ExistingPageDirection {
  if (input.pending) return "push";
  if (!input.localChanged && !input.remoteChanged) return "unchanged";
  if (input.localChanged && !input.remoteChanged) return "push";
  if (!input.localChanged && input.remoteChanged) return "pull";
  const localTime = Date.parse(input.localModifiedAt);
  const remoteTime = Date.parse(input.remoteEditedAt);
  return Number.isNaN(remoteTime) || localTime >= remoteTime ? "push" : "pull";
}
