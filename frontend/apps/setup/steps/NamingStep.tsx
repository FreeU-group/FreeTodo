"use client";

import { Sparkles, UserCircle } from "lucide-react";
import { useSetupStore } from "@/lib/store/setup-store";

interface NamingStepProps {
	onNext: () => void;
	onBack: () => void;
}

export function NamingStep({ onNext, onBack }: NamingStepProps) {
	const {
		userName,
		agentName,
		guessedUserName,
		setUserName,
		setAgentName,
		setUserNameManuallySet,
	} = useSetupStore();
	const userNameId = "setup-user-name";
	const agentNameId = "setup-agent-name";

	const handleUserNameChange = (value: string) => {
		setUserName(value);
		setUserNameManuallySet(true);
	};

	return (
		<div className="flex w-full max-w-md flex-col gap-5">
			<div className="text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
						<UserCircle className="h-6 w-6" />
					</div>
				</div>
				<h2 className="text-xl font-bold text-white">互相认识一下</h2>
				<p className="mt-1 text-sm text-white/60">
					告诉 Agent 你的名字，也给它起一个你喜欢的称呼
				</p>
			</div>

			<div className="space-y-4">
				<div>
					<label
						htmlFor={userNameId}
						className="mb-1 block text-xs font-medium text-white/70"
					>
						你的名字
					</label>
					<input
						id={userNameId}
						type="text"
						className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
						placeholder="输入你的名字或昵称"
						value={userName}
						onChange={(e) => handleUserNameChange(e.target.value)}
					/>
					{guessedUserName && userName === guessedUserName ? (
						<p className="mt-1 flex items-center gap-1 text-xs text-primary/60">
							<Sparkles className="h-3 w-3" />
							AI 从你的文件中猜测的名字，可直接修改
						</p>
					) : (
						<p className="mt-1 text-xs text-white/40">
							Agent 会用这个名字称呼你
						</p>
					)}
				</div>

				<div>
					<label
						htmlFor={agentNameId}
						className="mb-1 block text-xs font-medium text-white/70"
					>
						Agent 的名字
					</label>
					<input
						id={agentNameId}
						type="text"
						className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
						placeholder="Free U"
						value={agentName}
						onChange={(e) => setAgentName(e.target.value)}
					/>
					<p className="mt-1 text-xs text-white/40">
						你可以叫它任何名字
					</p>
				</div>
			</div>

			{/* Preview */}
			{userName && (
				<div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm text-white/80">
					<span className="font-bold text-primary/90">{agentName || "Free U"}</span>
					{" "}向你问好：「你好，
					<span className="font-bold text-white">{userName}</span>
					！我是你的专属 Agent，有什么可以帮你的？」
				</div>
			)}

			<div className="flex gap-3">
				<button
					type="button"
					onClick={onBack}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
				>
					上一步
				</button>
				<button
					type="button"
					onClick={onNext}
					disabled={!userName.trim()}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-40"
				>
					下一步
				</button>
			</div>
		</div>
	);
}
