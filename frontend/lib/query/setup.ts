import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE =
	typeof window !== "undefined"
		? ""
		: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${url}`, {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

export function useSetupStatus() {
	return useQuery({
		queryKey: ["setup-status"],
		queryFn: () => fetchJson<{ completed: boolean }>("/api/setup/status"),
		staleTime: 60_000,
	});
}

export function useScanDirectory() {
	return useMutation({
		mutationFn: (args: { directory: string; maxFiles?: number }) =>
			fetchJson<{
				valid: boolean;
				directory: string;
				file_count: number;
				files: Array<{ name: string; path: string; size: number; modified: number; ext: string }>;
				scan_time_ms: number;
			}>("/api/setup/scan-directory", {
				method: "POST",
				body: JSON.stringify({
					directory: args.directory,
					max_files: args.maxFiles ?? 500,
				}),
			}),
	});
}

export function useAnalyzeFiles() {
	return useMutation({
		mutationFn: (args: { filenames: string[]; directory: string }) =>
			fetchJson<{ guessed_name: string; initial_profile: string }>(
				"/api/setup/analyze-files",
				{
					method: "POST",
					body: JSON.stringify({
						filenames: args.filenames,
						directory: args.directory,
					}),
				},
			),
	});
}

export function useCompleteSetup() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (args: {
			userName: string;
			agentName: string;
			scanDirectories: string[];
			allowedApps: string[];
			initialProfile?: string;
		}) =>
			fetchJson<{ success: boolean }>("/api/setup/complete", {
				method: "POST",
				body: JSON.stringify({
					user_name: args.userName,
					agent_name: args.agentName,
					scan_directories: args.scanDirectories,
					allowed_apps: args.allowedApps,
					initial_profile: args.initialProfile ?? "",
				}),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["setup-status"] });
		},
	});
}

export function useResetSetup() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			fetchJson<{ success: boolean }>("/api/setup/reset", {
				method: "POST",
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["setup-status"] });
		},
	});
}
