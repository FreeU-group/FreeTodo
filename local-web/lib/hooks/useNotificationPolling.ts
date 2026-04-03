import { useEffect } from "react";
import {
	getNotificationPoller,
	cleanupNotificationPoller,
} from "@/lib/services/notification-poller";

const NOTIFICATIONS_POLL_INTERVAL = 5000;

/**
 * Start the NotificationPoller with the standard `/api/notifications` endpoint.
 * Call once in a top-level component (e.g. DynamicIsland).
 * The poller handles interactive popups for `pending_todo` / `pending_execute`.
 */
export function useNotificationPolling() {
	useEffect(() => {
		const poller = getNotificationPoller();

		poller.registerEndpoint({
			id: "backend-notifications",
			url: "/api/notifications",
			interval: NOTIFICATIONS_POLL_INTERVAL,
			enabled: true,
		});

		return () => {
			cleanupNotificationPoller();
		};
	}, []);
}
