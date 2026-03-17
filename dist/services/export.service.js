import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { DEFAULT_HOURLY_RATE } from "../config";
import { formatLocalDateYMD, msToRoundedMinutes } from "../utils/time";
export function saveFilesFromTimeEntries(entries, { start, end }, hourlyRate = DEFAULT_HOURLY_RATE) {
    const projectRoot = path.join(__dirname, "..", "..");
    const exportsDir = path.join(projectRoot, "exports");
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir);
    }
    const startDate = formatLocalDateYMD(start);
    const endDate = formatLocalDateYMD(end);
    const csvFilename = `time-entries_${startDate}_to_${endDate}.csv`;
    const csvFilePath = path.join(exportsDir, csvFilename);
    let totalDurationMs = 0;
    const records = entries.map((entry) => {
        const durationMs = Number(entry.duration);
        totalDurationMs += durationMs;
        const { hours, minutes } = msToRoundedMinutes(durationMs);
        return {
            task_id: entry.task?.id || "",
            task_name: entry.task?.name || "",
            date: new Date(Number(entry.start)).toISOString().slice(0, 10),
            hours,
            minutes,
        };
    });
    const csv = stringify(records, {
        header: true,
        columns: [
            { key: "task_id", header: "Task ID" },
            { key: "task_name", header: "Task" },
            { key: "date", header: "Date" },
            { key: "hours", header: "Hours" },
            { key: "minutes", header: "Minutes" },
        ],
    });
    fs.writeFileSync(csvFilePath, csv, "utf8");
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalHoursInt = Math.floor(totalMinutes / 60);
    const totalMinutesRemainder = totalMinutes % 60;
    const totalHoursDecimal = totalHoursInt + totalMinutesRemainder / 60;
    const totalAmount = Number((totalHoursDecimal * hourlyRate).toFixed(2));
    const summaryText = `Total Hours: ${totalHoursInt}h ${totalMinutesRemainder}m (${totalHoursDecimal.toFixed(2)})\n` + `Total Amount: $${totalAmount.toFixed(2)}\n`;
    const txtFilename = `summary_${startDate}_to_${endDate}.txt`;
    const txtFilePath = path.join(__dirname, "..", "exports", txtFilename);
    fs.writeFileSync(txtFilePath, summaryText, "utf8");
    return {
        csvFilePath,
        txtFilePath,
        totalHoursInt,
        totalMinutesRemainder,
        totalHoursDecimal,
        totalAmount,
    };
}
