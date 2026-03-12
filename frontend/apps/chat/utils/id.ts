export const createId = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
