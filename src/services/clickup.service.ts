import { CLICKUP_TOKEN, TEAM_ID,  } from "../config";
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

export interface ClickUpUserInfo   {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    color: string;
    profilePicture: string;
    initials: string;
    week_start_day: string | null;
    global_font_support: boolean;
    timezone: string;
    [key: string]: unknown;
  }
 
}
export async function fetchTimeEntriesForRange({ start, end }: TimeRange, userInfo: ClickUpUserInfo): Promise<ClickUpTimeEntry[]> {
 
  const userId = userInfo.user.id;
 
  const url = new URL(`${CLICKUP_BASE_URL}/team/${TEAM_ID}/time_entries`);
  url.searchParams.set("start_date", String(start));
  url.searchParams.set("end_date", String(end));
  url.searchParams.set("assignee", String(userId));

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

export async function fetchUserInfo(): Promise<ClickUpUserInfo> {
  try {
    const response = await fetch(`${CLICKUP_USER_BASE_URL}/`, {
      headers: {
        Authorization: CLICKUP_TOKEN ?? "",
      },
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
