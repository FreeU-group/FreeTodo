const DUPLICATE_SUPPRESS_MS = 10 * 60 * 1000;

export interface PopupDeduplicationInput {
	actionId: string;
	actionType: "todo" | "executable";
	title: string;
	description: string;
}

export class NotificationPopupDeduper {
	private recentFingerprints: Map<string, number> = new Map();
	private actionFingerprints: Map<string, string> = new Map();

	private buildFingerprint(input: PopupDeduplicationInput): string {
		const normalize = (value: string | undefined): string =>
			String(value || "")
				.toLowerCase()
				.replace(/\s+/g, " ")
				.trim();
		return [
			input.actionType,
			normalize(input.title),
			normalize(input.description),
		].join("|");
	}

	private prune(now: number = Date.now()): void {
		for (const [fingerprint, expiresAt] of this.recentFingerprints.entries()) {
			if (expiresAt <= now) {
				this.recentFingerprints.delete(fingerprint);
			}
		}
	}

	shouldSuppress(input: PopupDeduplicationInput): boolean {
		this.prune();
		const fingerprint = this.buildFingerprint(input);
		return (this.recentFingerprints.get(fingerprint) ?? 0) > Date.now();
	}

	remember(input: PopupDeduplicationInput): string {
		const fingerprint = this.buildFingerprint(input);
		const expiresAt = Date.now() + DUPLICATE_SUPPRESS_MS;
		this.actionFingerprints.set(input.actionId, fingerprint);
		this.recentFingerprints.set(fingerprint, expiresAt);
		return fingerprint;
	}

	suppressFutureDuplicates(actionId: string): void {
		const fingerprint = this.actionFingerprints.get(actionId);
		if (!fingerprint) return;
		this.recentFingerprints.set(fingerprint, Date.now() + DUPLICATE_SUPPRESS_MS);
	}
}
