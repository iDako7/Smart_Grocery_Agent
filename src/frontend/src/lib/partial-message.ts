export function partialBannerMessage(reason: string | null): string {
  if (reason === "max_iterations") {
    return "The assistant hit its thinking limit. Some results may be incomplete.";
  }
  if (reason?.startsWith("agent_error:")) {
    return "Something went wrong while processing your request. Please try again.";
  }
  return "The response is incomplete. Please try again.";
}
