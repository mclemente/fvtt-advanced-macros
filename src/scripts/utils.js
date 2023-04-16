export function error(error, notify = true) {
	const errorMsg = `Advanced Macros | ${error}`;
	if (notify) ui.notifications?.error(errorMsg);
	return new Error(errorMsg.replace(/\s*<br>\s*/g, "\n"));
}
