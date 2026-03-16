export function formatDateTime(isoString: string | null | undefined): string {
    if (!isoString) return '—';
    // Append 'Z' if the string has no timezone info, so JS treats it as UTC
    const normalized = isoString.endsWith('Z') || isoString.includes('+') ? isoString : isoString + 'Z';
    const date = new Date(normalized);
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}
