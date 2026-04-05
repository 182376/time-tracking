export function buildDangerConfirmMessage(action: string, detail?: string) {
  const lines = [
    `【高风险操作】${action}`,
    "此操作不可撤销，是否继续？",
  ];

  if (detail?.trim()) {
    lines.splice(1, 0, detail.trim());
  }

  return lines.join("\n");
}
