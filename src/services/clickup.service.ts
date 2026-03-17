import { CLICKUP_TOKEN, TEAM_ID, getUserId } from "../config";
import { CLICKUP_BASE_URL, CLICKUP_USER_BASE_URL } from "../utils/constants";
import type { TimeRange } from "../utils/time";

export interface ClickUpTask {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ClickUpTimeEntry {
  id?: string;
  duration: number;
  start: number;
  task?: ClickUpTask;
  [key: string]: unknown;
}

export async function fetchTimeEntriesForRange({ start, end }: TimeRange): Promise<ClickUpTimeEntry[]> {
  const url = new URL(`${CLICKUP_BASE_URL}/team/${TEAM_ID}/time_entries`);
  url.searchParams.set("start_date", String(start));
  url.searchParams.set("end_date", String(end));
  url.searchParams.set("assignee", String(getUserId()));

  const headers: HeadersInit = {
    Authorization: CLICKUP_TOKEN ?? "",
  };

  const response = await fetch(url, {
    method: "GET",
    headers,
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


export async function fetchUserInfo() {
  const response = await fetch(`${CLICKUP_USER_BASE_URL}`, {
    headers: {
      Authorization: CLICKUP_TOKEN ?? "",
    },
  });
  const data = await response.json();
  return data;
}
