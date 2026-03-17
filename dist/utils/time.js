export function getLastFortnightRange() {
    const now = new Date();
    const end = now.getTime();
    const start = new Date(now);
    // hoje + 14 dias anteriores = 15 dias
    start.setDate(start.getDate() - 14);
    return {
        start: start.getTime(),
        end,
    };
}
export function getQuinzenaRange({ startParam, endParam, }) {
    // 1) Se vierem datas pela URL (YYYY-MM-DD), respeita
    if (startParam) {
        const startDate = new Date(startParam);
        if (Number.isNaN(startDate.getTime())) {
            throw new Error("Parâmetro 'start' inválido. Use YYYY-MM-DD.");
        }
        let endDate;
        if (endParam) {
            endDate = new Date(endParam);
            if (Number.isNaN(endDate.getTime())) {
                throw new Error("Parâmetro 'end' inválido. Use YYYY-MM-DD.");
            }
        }
        else {
            endDate = new Date();
        }
        endDate.setHours(23, 59, 59, 999);
        return {
            start: startDate.getTime(),
            end: endDate.getTime(),
        };
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    let startDate;
    let endDate;
    if (day <= 15) {
        startDate = new Date(year, month, 1, 0, 0, 0, 0);
        endDate = new Date(year, month, 15, 23, 59, 59, 999);
    }
    else {
        startDate = new Date(year, month, 16, 0, 0, 0, 0);
        endDate = new Date(year, month, day, 23, 59, 59, 999);
    }
    return {
        start: startDate.getTime(),
        end: endDate.getTime(),
    };
}
export function msToRoundedMinutes(ms) {
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes, totalMinutes };
}
export function formatLocalDateYMD(timestamp) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
