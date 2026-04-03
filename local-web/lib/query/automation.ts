import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetcher } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type {
	AutomationTask,
	AutomationTaskCreateInput,
	AutomationTaskListResponse,
	AutomationTaskUpdateInput,
} from "@/lib/types";

export const useAutomationTasks = () =>
	useQuery({
		queryKey: queryKeys.automationTasks.list(),
		queryFn: () =>
			customFetcher<AutomationTaskListResponse>("/api/automation/tasks"),
	});

export const useCreateAutomationTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: AutomationTaskCreateInput) =>
			customFetcher<AutomationTask>("/api/automation/tasks", {
				method: "POST",
				data: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.automationTasks.all,
			});
		},
	});
};

export const useUpdateAutomationTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			input,
		}: {
			id: number;
			input: AutomationTaskUpdateInput;
		}) =>
			customFetcher<AutomationTask>(`/api/automation/tasks/${id}`, {
				method: "PUT",
				data: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.automationTasks.all,
			});
		},
	});
};

export const useDeleteAutomationTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) =>
			customFetcher(`/api/automation/tasks/${id}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.automationTasks.all,
			});
		},
	});
};

export const useRunAutomationTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) =>
			customFetcher(`/api/automation/tasks/${id}/run`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.automationTasks.all,
			});
		},
	});
};

export const useToggleAutomationTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
			customFetcher(
				`/api/automation/tasks/${id}/${enabled ? "resume" : "pause"}`,
				{
					method: "POST",
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.automationTasks.all,
			});
		},
	});
};
