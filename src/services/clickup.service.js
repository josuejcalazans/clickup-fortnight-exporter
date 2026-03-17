import { CLICKUP_TOKEN, TEAM_ID, USER_ID } from "../config.js";
import { CLICKUP_BASE_URL } from "../utils/constants.js";

export async function fetchTimeEntriesForRange({ start, end }) {
  const url = new URL(`${CLICKUP_BASE_URL}/team/${TEAM_ID}/time_entries`);
  url.searchParams.set("start_date", String(start));
  url.searchParams.set("end_date", String(end));
  url.searchParams.set("assignee", String(USER_ID));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: CLICKUP_TOKEN,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Erro ao buscar time entries (${response.status} ${response.statusText}): ${text}`,
    );
  }

  const data = await response.json();
  return data?.data ?? [];
}

